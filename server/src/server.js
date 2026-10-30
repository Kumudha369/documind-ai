import fs from 'node:fs';
import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { assertEnv, env } from './config/env.js';
import { Conversation } from './models/Conversation.js';
import { Document } from './models/Document.js';
import { DocumentChunk } from './models/DocumentChunk.js';
import { Message } from './models/Message.js';
import { User } from './models/User.js';
import { uploadRoot } from './middleware/upload.js';
import { recoverPending } from './services/processor.js';

async function main() {
  assertEnv(); // stop immediately if the configuration is wrong
  fs.mkdirSync(uploadRoot, { recursive: true });
  await connectDb();
  // Make sure every index exists (including the text index that keyword search needs).
  await Promise.all([User, Document, DocumentChunk, Conversation, Message].map((m) => m.init()));
  await recoverPending(); // resume documents that were mid-processing when the server last stopped

  const server = createApp().listen(env.port, () => {
    console.log(`[server] http://localhost:${env.port}  (llm=${env.llmProvider}, embeddings=${env.embeddingProvider})`);
  });

  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
