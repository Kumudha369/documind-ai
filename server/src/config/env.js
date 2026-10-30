// Reads and validates environment variables once, at start-up.
// Failing fast here is better than a confusing crash later.

const int = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`Environment variable ${name} must be a number`);
  return n;
};

const str = (name, fallback = '') => (process.env[name] ?? fallback).trim();

const nodeEnv = str('NODE_ENV', 'development');

export const env = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: int('PORT', 5000),
  clientOrigin: str('CLIENT_ORIGIN', 'http://localhost:5173'),
  mongoUri: str('MONGODB_URI', 'mongodb://127.0.0.1:27017/documind'),

  jwtSecret: str('JWT_SECRET'),
  jwtExpiresIn: str('JWT_EXPIRES_IN', '7d'),

  llmProvider: str('LLM_PROVIDER', 'mock'),
  anthropicApiKey: str('ANTHROPIC_API_KEY'),
  anthropicModel: str('ANTHROPIC_MODEL', 'claude-sonnet-5-5'),
  openaiApiKey: str('OPENAI_API_KEY'),
  openaiChatModel: str('OPENAI_CHAT_MODEL', 'gpt-4o-mini'),

  embeddingProvider: str('EMBEDDING_PROVIDER', 'local'),
  openaiEmbeddingModel: str('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'),
  voyageApiKey: str('VOYAGE_API_KEY'),
  voyageEmbeddingModel: str('VOYAGE_EMBEDDING_MODEL', 'voyage-3.5'),

  uploadDir: str('UPLOAD_DIR', './uploads'),
  maxFileSizeMb: int('MAX_FILE_SIZE_MB', 15),
  chunkSize: int('CHUNK_SIZE', 1000),
  chunkOverlap: int('CHUNK_OVERLAP', 200),
  processingConcurrency: int('PROCESSING_CONCURRENCY', 2),
  maxProcessingAttempts: int('MAX_PROCESSING_ATTEMPTS', 3),

  authRateLimit: int('AUTH_RATE_LIMIT', 30), // login/register attempts per 15 min per IP
  aiRateLimit: int('AI_RATE_LIMIT', 40), // AI calls per minute per IP
};

export function assertEnv() {
  const problems = [];
  if (env.jwtSecret.length < 32) {
    problems.push('JWT_SECRET must be set and at least 32 characters long.');
  }
  if (env.isProd && env.jwtSecret.startsWith('change-me')) {
    problems.push('JWT_SECRET is still the example placeholder. Generate a real random secret.');
  }
  if (!['anthropic', 'openai', 'mock'].includes(env.llmProvider)) {
    problems.push('LLM_PROVIDER must be one of: anthropic, openai, mock.');
  }
  if (env.llmProvider === 'anthropic' && !env.anthropicApiKey) {
    problems.push('ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic.');
  }
  if (env.llmProvider === 'openai' && !env.openaiApiKey) {
    problems.push('OPENAI_API_KEY is required when LLM_PROVIDER=openai.');
  }
  if (!['openai', 'voyage', 'local'].includes(env.embeddingProvider)) {
    problems.push('EMBEDDING_PROVIDER must be one of: openai, voyage, local.');
  }
  if (env.embeddingProvider === 'openai' && !env.openaiApiKey) {
    problems.push('OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai.');
  }
  if (env.embeddingProvider === 'voyage' && !env.voyageApiKey) {
    problems.push('VOYAGE_API_KEY is required when EMBEDDING_PROVIDER=voyage.');
  }
  if (env.chunkOverlap >= env.chunkSize) {
    problems.push('CHUNK_OVERLAP must be smaller than CHUNK_SIZE.');
  }
  if (problems.length) {
    throw new Error(`Invalid configuration:\n - ${problems.join('\n - ')}`);
  }
}
