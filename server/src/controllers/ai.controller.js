import { Conversation } from '../models/Conversation.js';
import { Document, STATUS } from '../models/Document.js';
import { Message } from '../models/Message.js';
import { answerQuestion } from '../services/qa.js';
import { resolveDocuments, searchChunks } from '../services/retrieval.js';
import { getSummary } from '../services/summarize.js';
import { ApiError } from '../utils/ApiError.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function summarize(req, res) {
  const { documentId, length, refresh } = req.body;
  const doc = await Document.findOne({ _id: documentId, userId: req.user.id });
  if (!doc) throw ApiError.notFound('Document not found.');
  if (doc.processingStatus !== STATUS.COMPLETED) throw ApiError.conflict('This document has not finished processing.');

  const { summary, cached } = await getSummary(doc, length, { refresh });
  res.json({ documentId, length, cached, summary });
}

export async function ask(req, res) {
  const { question, conversationId, documentIds } = req.body;
  const userId = req.user.id;

  let conversation = null;
  if (conversationId) {
    conversation = await Conversation.findOne({ _id: conversationId, userId });
    if (!conversation) throw ApiError.notFound('Conversation not found.');
  }

  const scopeIds = documentIds ?? conversation?.documentIds.map(String) ?? [];
  const docs = await resolveDocuments(userId, scopeIds);

  let history = [];
  if (conversation) {
    history = (
      await Message.find({ conversationId: conversation._id, userId }).sort({ _id: -1 }).limit(6).lean()
    ).reverse();
  }

  // Generate first, save afterwards: if the AI call fails, no half-finished turn is left behind.
  const result = await answerQuestion({ userId, question, docs, history });

  if (!conversation) {
    conversation = await Conversation.create({
      userId,
      title: question.slice(0, 60),
      documentIds: scopeIds,
    });
  } else {
    await Conversation.updateOne({ _id: conversation._id }, { $set: { documentIds: scopeIds } }); // also bumps updatedAt
  }

  const now = Date.now();
  const [userMessage, assistantMessage] = await Message.create(
    [
      { conversationId: conversation._id, userId, role: 'user', content: question, createdAt: new Date(now) },
      {
        conversationId: conversation._id,
        userId,
        role: 'assistant',
        content: result.content,
        sourceReferences: result.sources,
        insufficientEvidence: result.insufficientEvidence,
        createdAt: new Date(now + 1),
      },
    ],
    { ordered: true }
  );

  const fresh = await Conversation.findById(conversation._id);
  res.status(201).json({
    conversation: fresh.toPublic(),
    userMessage: userMessage.toPublic(),
    assistantMessage: assistantMessage.toPublic(),
  });
}

export async function search(req, res) {
  const { query, documentIds, tags, documentName, mode, limit } = req.body;
  const userId = req.user.id;

  // 1) Which documents are we allowed (and asked) to search?
  let docs = await resolveDocuments(userId, documentIds ?? []);
  if (tags?.length) {
    const wanted = new Set(tags.map((t) => t.toLowerCase()));
    docs = docs.filter((d) => d.tags?.some((t) => wanted.has(t)));
  }
  if (documentName) {
    const rx = new RegExp(escapeRegex(documentName), 'i');
    docs = docs.filter((d) => rx.test(d.originalFilename));
  }

  // 2) Documents whose NAME or TAG matches the query (e.g. searching "invoice" finds invoice.pdf).
  const rx = new RegExp(escapeRegex(query), 'i');
  const documentMatches = docs
    .filter((d) => rx.test(d.originalFilename) || d.tags?.some((t) => rx.test(t)))
    .map((d) => ({ id: d._id.toString(), originalFilename: d.originalFilename, tags: d.tags }));

  // 3) Passage search (semantic, keyword, or both combined).
  const results = docs.length ? await searchChunks({ userId, docs, query, mode, limit }) : [];

  res.json({
    query,
    mode,
    searchedDocuments: docs.length,
    documentMatches,
    results: results.map(({ text, ...r }) => r), // excerpt is enough; don't ship whole chunks
  });
}
