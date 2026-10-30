import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import aiRoutes from './routes/ai.routes.js';
import authRoutes from './routes/auth.routes.js';
import conversationRoutes from './routes/conversations.routes.js';
import documentRoutes from './routes/documents.routes.js';

const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

// Kept separate from server.js so tests can start the app without opening a port.
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.isProd) app.set('trust proxy', 1); // we run behind a reverse proxy in production

  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/conversations', conversationRoutes);

  // Production: serve the built React app from the same server (same origin = simple cookies).
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
