import { Document, STATUS } from '../models/Document.js';
import { DocumentChunk } from '../models/DocumentChunk.js';
import { ApiError } from '../utils/ApiError.js';
import { embedQuery, embeddingModelId, minSimilarity } from './embeddings.js';
import { bestExcerpt } from './excerpt.js';
import { cosineSimilarity, reciprocalRankFusion, TopK } from './vector.js';

/**
 * Turns the ids the browser sent into documents this user really owns.
 * - Not yours / doesn't exist  -> 404 (we don't reveal whether it exists for someone else)
 * - Not finished processing     -> 409
 * - No ids sent                 -> every Completed document the user has
 */
export async function resolveDocuments(userId, documentIds = []) {
  const unique = [...new Set(documentIds.map(String))];
  const filter = { userId };
  if (unique.length) filter._id = { $in: unique };
  else filter.processingStatus = STATUS.COMPLETED;

  const docs = await Document.find(filter).select('originalFilename processingStatus tags').lean();

  if (unique.length) {
    if (docs.length !== unique.length) throw ApiError.notFound('One or more selected documents were not found.');
    const notReady = docs.filter((d) => d.processingStatus !== STATUS.COMPLETED);
    if (notReady.length) {
      throw ApiError.conflict(
        `Still not ready: ${notReady.map((d) => d.originalFilename).join(', ')}. Wait until processing is Completed.`
      );
    }
  } else if (!docs.length) {
    throw ApiError.unprocessable('You have no processed documents yet. Upload one and wait for it to finish.');
  }
  return docs;
}

/** Semantic ranking: cosine similarity between the question vector and every chunk vector. */
async function semanticRank(userId, docIds, query, limit) {
  const queryVector = await embedQuery(query);
  const top = new TopK(limit);
  const threshold = minSimilarity();
  // Stream chunks one by one so a big library never sits in memory all at once.
  const cursor = DocumentChunk.find({
    userId,
    documentId: { $in: docIds },
    embeddingModel: embeddingModelId(), // never compare vectors from different models
  })
    .select('+embedding')
    .lean()
    .cursor();
  for await (const chunk of cursor) {
    const score = cosineSimilarity(queryVector, chunk.embedding);
    if (score >= threshold) top.push(chunk._id.toString(), score);
  }
  return top.result().map((r) => ({ id: r.item, score: r.score }));
}

/** Keyword ranking: MongoDB's built-in text index (word stemming + TF-IDF style score). */
async function keywordRank(userId, docIds, query, limit) {
  const rows = await DocumentChunk.find(
    { userId, documentId: { $in: docIds }, $text: { $search: query } },
    { _id: 1, score: { $meta: 'textScore' } }
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .lean();
  return rows.map((r) => ({ id: r._id.toString(), score: r.score }));
}

/**
 * mode: 'hybrid' (default) | 'semantic' | 'keyword'
 * Returns chunks (no embeddings) with a 0..1 `score`, best first.
 * ALWAYS filtered by userId, so one user can never retrieve another user's text.
 */
export async function searchChunks({ userId, docs, query, mode = 'hybrid', limit = 8 }) {
  const docIds = docs.map((d) => d._id);
  const pool = Math.max(limit * 3, 20);

  const [semantic, keyword] = await Promise.all([
    mode === 'keyword' ? [] : semanticRank(userId, docIds, query, pool),
    mode === 'semantic' ? [] : keywordRank(userId, docIds, query, pool),
  ]);

  const lists = [];
  if (mode !== 'keyword') lists.push(semantic.map((s) => s.id));
  if (mode !== 'semantic') lists.push(keyword.map((k) => k.id));
  const fused = reciprocalRankFusion(lists).slice(0, limit);
  if (!fused.length) return [];

  const rows = await DocumentChunk.find({ _id: { $in: fused.map((f) => f.id) }, userId })
    .select('documentId chunkIndex text pageNumber startLine endLine')
    .lean();
  const byId = new Map(rows.map((r) => [r._id.toString(), r]));
  const names = new Map(docs.map((d) => [d._id.toString(), d.originalFilename]));
  const semanticScore = new Map(semantic.map((s) => [s.id, s.score]));
  const keywordIds = new Set(keyword.map((k) => k.id));

  return fused
    .filter((f) => byId.has(f.id))
    .map((f) => {
      const c = byId.get(f.id);
      return {
        chunkId: f.id,
        documentId: c.documentId.toString(),
        documentName: names.get(c.documentId.toString()) ?? 'Unknown document',
        chunkIndex: c.chunkIndex,
        pageNumber: c.pageNumber,
        startLine: c.startLine,
        endLine: c.endLine,
        text: c.text,
        excerpt: bestExcerpt(c.text, query),
        score: Number(f.score.toFixed(4)),
        semanticScore: semanticScore.has(f.id) ? Number(semanticScore.get(f.id).toFixed(4)) : null,
        keywordMatch: keywordIds.has(f.id),
      };
    });
}
