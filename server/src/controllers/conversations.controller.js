import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { resolveDocuments } from '../services/retrieval.js';
import { ApiError } from '../utils/ApiError.js';

async function findOwned(req) {
  const c = await Conversation.findOne({ _id: req.params.id, userId: req.user.id });
  if (!c) throw ApiError.notFound('Conversation not found.');
  return c;
}

export async function create(req, res) {
  const { title, documentIds } = req.body;
  if (documentIds?.length) await resolveDocuments(req.user.id, documentIds); // must own them all
  const c = await Conversation.create({
    userId: req.user.id,
    title: title ?? 'New conversation',
    documentIds: documentIds ?? [],
  });
  res.status(201).json({ conversation: c.toPublic() });
}

export async function list(req, res) {
  const items = await Conversation.find({ userId: req.user.id }).sort({ updatedAt: -1 }).limit(100);
  res.json({ conversations: items.map((c) => c.toPublic()) });
}

export async function getOne(req, res) {
  const c = await findOwned(req);
  const messages = await Message.find({ conversationId: c._id, userId: req.user.id })
    .sort({ createdAt: 1, _id: 1 })
    .limit(500);
  res.json({ conversation: c.toPublic(), messages: messages.map((m) => m.toPublic()) });
}

export async function update(req, res) {
  const c = await findOwned(req);
  const { title, documentIds } = req.body;
  if (title !== undefined) c.title = title;
  if (documentIds !== undefined) {
    if (documentIds.length) await resolveDocuments(req.user.id, documentIds);
    c.documentIds = documentIds;
  }
  await c.save();
  res.json({ conversation: c.toPublic() });
}

export async function remove(req, res) {
  const c = await findOwned(req);
  await Message.deleteMany({ conversationId: c._id });
  await c.deleteOne();
  res.status(204).end();
}
