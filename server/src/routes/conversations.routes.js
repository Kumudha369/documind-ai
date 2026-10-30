import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/conversations.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { isObjectId, validateBody, validateIdParam } from '../middleware/validate.js';

const router = Router();
router.use(requireAuth);

const objectId = z.string().refine(isObjectId, 'Invalid id.');
const title = z.string().trim().min(1, 'Title cannot be empty.').max(120);

const createSchema = z.object({ title: title.optional(), documentIds: z.array(objectId).max(50).optional() });
const patchSchema = z
  .object({ title: title.optional(), documentIds: z.array(objectId).max(50).optional() })
  .refine((v) => v.title !== undefined || v.documentIds !== undefined, 'Send a new title and/or documentIds.');

router.post('/', validateBody(createSchema), ctrl.create);
router.get('/', ctrl.list);
router.get('/:id', validateIdParam(), ctrl.getOne);
router.patch('/:id', validateIdParam(), validateBody(patchSchema), ctrl.update);
router.delete('/:id', validateIdParam(), ctrl.remove);

export default router;
