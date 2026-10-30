import path from 'node:path';
import { env } from '../config/env.js';
import { Document, STATUS } from '../models/Document.js';
import { DocumentChunk } from '../models/DocumentChunk.js';
import { uploadRoot } from '../middleware/upload.js';
import { chunkDocument } from './chunker.js';
import { embedDocuments, embeddingModelId } from './embeddings.js';
import { ExtractionError, extractText, isPermanent } from './extract.js';

// ---------------------------------------------------------------------------
// Background processing. Uploading returns immediately; the heavy work
// (extract -> chunk -> embed -> save) runs here, a couple of documents at a time.
//
// Failure handling:
//   * Permanent problems (corrupt / scanned / empty file) -> status "Failed" at once.
//   * Temporary problems (embedding API down, rate limit) -> retried with back-off, up to
//     MAX_PROCESSING_ATTEMPTS, then "Failed" with the reason shown in the UI.
//   * Server restart mid-processing -> recoverPending() re-queues those documents on start-up.
//   * Every attempt first deletes old chunks, so a retry never creates duplicates.
// ---------------------------------------------------------------------------

const queue = [];
const queued = new Set();
let running = 0;

export function enqueue(documentId) {
  const id = documentId.toString();
  if (queued.has(id)) return;
  queued.add(id);
  queue.push(id);
  pump();
}

function pump() {
  while (running < env.processingConcurrency && queue.length) {
    const id = queue.shift();
    running++;
    processDocument(id)
      .catch((err) => console.error('[processor] unexpected error', err))
      .finally(() => {
        running--;
        queued.delete(id);
        pump();
      });
  }
}

export async function recoverPending() {
  const pending = await Document.find({
    processingStatus: { $in: [STATUS.UPLOADED, STATUS.PROCESSING] },
  }).select('_id');
  pending.forEach((d) => enqueue(d._id));
  if (pending.length) console.log(`[processor] re-queued ${pending.length} unfinished document(s)`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function processDocument(documentId) {
  const doc = await Document.findById(documentId);
  if (!doc) return; // deleted while waiting in the queue

  const filePath = path.join(uploadRoot, doc.userId.toString(), doc.storedFilename);

  for (let attempt = 1; attempt <= env.maxProcessingAttempts; attempt++) {
    try {
      await Document.updateOne(
        { _id: doc._id },
        { processingStatus: STATUS.PROCESSING, processingError: null, processingAttempts: attempt }
      );

      const { pages, pageCount } = await extractText(filePath, doc.fileType);
      const pieces = chunkDocument(pages, { chunkSize: env.chunkSize, overlap: env.chunkOverlap });
      if (!pieces.length) throw new ExtractionError('The document contains no text.');

      const vectors = await embedDocuments(pieces.map((p) => p.text));
      const modelId = embeddingModelId();

      // Document may have been deleted while we were embedding.
      if (!(await Document.exists({ _id: doc._id }))) return;

      await DocumentChunk.deleteMany({ documentId: doc._id });
      await DocumentChunk.insertMany(
        pieces.map((p, i) => ({
          documentId: doc._id,
          userId: doc.userId,
          chunkIndex: i,
          text: p.text,
          pageNumber: p.pageNumber,
          startLine: p.startLine,
          endLine: p.endLine,
          embedding: vectors[i],
          embeddingModel: modelId,
        })),
        { ordered: true }
      );

      await Document.updateOne(
        { _id: doc._id },
        {
          $set: {
            processingStatus: STATUS.COMPLETED,
            processingError: null,
            pageCount,
            chunkCount: pieces.length,
            charCount: pieces.reduce((s, p) => s + p.text.length, 0),
          },
          $unset: { summaries: 1 }, // text may have changed on a retry, so cached summaries are stale
        }
      );
      console.log(`[processor] ${doc.originalFilename}: ${pieces.length} chunks`);
      return;
    } catch (err) {
      const permanent = isPermanent(err);
      const last = attempt === env.maxProcessingAttempts;
      console.warn(`[processor] ${doc.originalFilename} attempt ${attempt} failed: ${err.message}`);
      if (permanent || last) {
        await DocumentChunk.deleteMany({ documentId: doc._id });
        await Document.updateOne(
          { _id: doc._id },
          {
            processingStatus: STATUS.FAILED,
            processingError: permanent ? err.message : `Processing failed after ${attempt} attempts: ${err.message}`.slice(0, 400),
          }
        );
        return;
      }
      await sleep(1000 * 2 ** (attempt - 1)); // 1s, 2s, 4s ...
    }
  }
}
