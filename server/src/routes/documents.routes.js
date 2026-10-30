import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/documents.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadFiles } from '../middleware/upload.js';
import { validateBody, validateIdParam, validateQuery } from '../middleware/validate.js';
import { STATUS } from '../models/Document.js';

const router = Router();
router.use(requireAuth); // every document route needs a logged-in user

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  tag: z.string().trim().max(30).optional(),
  status: z.enum(Object.values(STATUS)).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const patchSchema = z
  .object({
    originalFilename: z.string().trim().min(1, 'Name cannot be empty.').max(255).optional(),
    tags: z
      .array(z.string().trim().toLowerCase().min(1).max(30))
      .max(10, 'A document can have at most 10 tags.')
      .optional(),
  })
  .refine((v) => v.originalFilename !== undefined || v.tags !== undefined, 'Send a new name and/or tags.');

router.post('/upload', uploadFiles, ctrl.upload);
router.get('/', validateQuery(listQuery), ctrl.list);
router.get('/tags', ctrl.listTags); // must stay above '/:id'
router.get('/:id', validateIdParam(), ctrl.getOne);
router.get('/:id/status', validateIdParam(), ctrl.getStatus);
router.get('/:id/file', validateIdParam(), ctrl.file);
router.patch('/:id', validateIdParam(), validateBody(patchSchema), ctrl.update);
router.post('/:id/retry', validateIdParam(), ctrl.retry);
router.delete('/:id', validateIdParam(), ctrl.remove);

export default router;
