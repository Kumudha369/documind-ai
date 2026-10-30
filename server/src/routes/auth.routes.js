import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import * as ctrl from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

// Slows down password guessing.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.authRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes and try again.' } },
});

const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(80),
  email,
  // bcrypt only reads the first 72 bytes, so we cap the length there.
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(72, 'Password must be at most 72 characters.')
    .regex(/[A-Za-z]/, 'Password needs at least one letter.')
    .regex(/\d/, 'Password needs at least one number.'),
});

const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required.').max(72) });

router.post('/register', limiter, validateBody(registerSchema), ctrl.register);
router.post('/login', limiter, validateBody(loginSchema), ctrl.login);
router.post('/logout', ctrl.logout);
router.get('/me', requireAuth, ctrl.me);

export default router;
