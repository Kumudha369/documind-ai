import fs from 'node:fs/promises';
import path from 'node:path';
import { uploadRoot, sniffFile } from '../middleware/upload.js';
import { Conversation } from '../models/Conversation.js';
import { Document, STATUS } from '../models/Document.js';
import { DocumentChunk } from '../models/DocumentChunk.js';
import { enqueue } from '../services/processor.js';
import { ApiError } from '../utils/ApiError.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every lookup includes userId, so a guessed or edited id from another account is simply "not found". */
async function findOwned(req) {
  const doc = await Document.findOne({ _id: req.params.id, userId: req.user.id });
  if (!doc) throw ApiError.notFound('Document not found.');
  return doc;
}

export async function upload(req, res) {
  const files = req.files ?? [];
  if (!files.length) throw ApiError.badRequest('Choose at least one PDF or TXT file (field name "files").');

  const documents = [];
  const rejected = [];

  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();
    const problem = await sniffFile(file.path, ext); // checks the real bytes, not just the name
    if (problem) {
      await fs.unlink(file.path).catch(() => {});
      rejected.push({ filename: file.originalname, reason: problem });
      continue;
    }
    const doc = await Document.create({
      userId: req.user.id,
      originalFilename: path.basename(file.originalname).slice(0, 255),
      storedFilename: file.filename,
      fileType: ext === '.pdf' ? 'pdf' : 'txt',
      mimeType: file.mimetype,
      fileSize: file.size,
    });
    enqueue(doc._id); // returns immediately; the work happens in the background
    documents.push(doc.toPublic());
  }

  if (!documents.length) throw ApiError.badRequest('No file could be accepted.', rejected);
  res.status(202).json({ documents, rejected });
}

export async function list(req, res) {
  const { q, tag, status, page, limit } = req.validatedQuery;
  const filter = { userId: req.user.id };
  if (status) filter.processingStatus = status;
  if (tag) filter.tags = tag.toLowerCase();
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ originalFilename: rx }, { tags: rx }];
  }

  const [docs, total] = await Promise.all([
    Document.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Document.countDocuments(filter),
  ]);
  res.json({ documents: docs.map((d) => d.toPublic()), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}

export async function listTags(req, res) {
  const tags = await Document.distinct('tags', { userId: req.user.id });
  res.json({ tags: tags.sort() });
}

export async function getOne(req, res) {
  res.json({ document: (await findOwned(req)).toPublic() });
}

export async function getStatus(req, res) {
  const doc = await Document.findOne({ _id: req.params.id, userId: req.user.id }).select(
    'processingStatus processingError processingAttempts chunkCount pageCount'
  );
  if (!doc) throw ApiError.notFound('Document not found.');
  res.json({
    status: doc.processingStatus,
    error: doc.processingError,
    attempts: doc.processingAttempts,
    chunkCount: doc.chunkCount,
    pageCount: doc.pageCount,
  });
}

export async function update(req, res) {
  const doc = await findOwned(req);
  const { originalFilename, tags } = req.body;
  if (originalFilename !== undefined) doc.originalFilename = originalFilename;
  if (tags !== undefined) doc.tags = [...new Set(tags)];
  await doc.save();
  res.json({ document: doc.toPublic() });
}

export async function retry(req, res) {
  const doc = await findOwned(req);
  if (doc.processingStatus !== STATUS.FAILED) throw ApiError.conflict('Only failed documents can be retried.');
  await Document.updateOne({ _id: doc._id }, { processingStatus: STATUS.UPLOADED, processingError: null });
  enqueue(doc._id);
  res.status(202).json({ document: (await Document.findById(doc._id)).toPublic() });
}

export async function remove(req, res) {
  const doc = await findOwned(req);
  await DocumentChunk.deleteMany({ documentId: doc._id }); // chunks + their embeddings
  await Conversation.updateMany({ userId: req.user.id, documentIds: doc._id }, { $pull: { documentIds: doc._id } });
  await doc.deleteOne();
  await fs.unlink(path.join(uploadRoot, doc.userId.toString(), doc.storedFilename)).catch(() => {});
  res.status(204).end();
}

// Lets the "open document" button show the original file. Same ownership check as everything else.
export async function file(req, res) {
  const doc = await findOwned(req);
  const abs = path.join(uploadRoot, doc.userId.toString(), doc.storedFilename);
  res.setHeader('Content-Type', doc.fileType === 'pdf' ? 'application/pdf' : 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.originalFilename)}`);
  if (doc.fileType === 'txt') res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.sendFile(abs, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: { code: 'NOT_FOUND', message: 'The stored file is missing.' } });
  });
}
