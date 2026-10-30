import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import * as ctrl from '../controllers/ai.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { isObjectId, validateBody } from '../middleware/validate.js';

const router = Router();
router.use(requireAuth);
// AI calls cost money, so cap them.
router.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: env.aiRateLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'You are sending requests too quickly. Please slow down.' } },
  })
);

const objectId = z.string().refine(isObjectId, 'Invalid id.');
const ids = z.array(objectId).max(50);

const summarizeSchema = z.object({
  documentId: objectId,
  length: z.enum(['short', 'medium', 'long']).default('medium'),
  refresh: z.boolean().default(false),
});

const askSchema = z.object({
  question: z.string().trim().min(2, 'Ask a question.').max(2000, 'Question is too long (max 2000 characters).'),
  conversationId: objectId.optional(),
  documentIds: ids.optional(), // omit = all documents (or the conversation's saved selection)
});

const searchSchema = z.object({
  query: z.string().trim().min(2, 'Type at least 2 characters.').max(500),
  documentIds: ids.optional(),
  tags: z.array(z.string().trim().max(30)).max(10).optional(),
  documentName: z.string().trim().max(100).optional(),
  mode: z.enum(['hybrid', 'semantic', 'keyword']).default('hybrid'),
  limit: z.number().int().min(1).max(20).default(8),
});

router.post('/summarize', validateBody(summarizeSchema), ctrl.summarize);
router.post('/ask', validateBody(askSchema), ctrl.ask);
router.post('/search', validateBody(searchSchema), ctrl.search);

export default router;
