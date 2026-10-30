import { env } from '../config/env.js';
import { localEmbed } from './localEmbedding.js';

// Identifies which model produced a vector. Stored on each chunk so we never compare
// vectors from different models (that would silently give nonsense scores).
export function embeddingModelId() {
  switch (env.embeddingProvider) {
    case 'openai':
      return `openai:${env.openaiEmbeddingModel}`;
    case 'voyage':
      return `voyage:${env.voyageEmbeddingModel}`;
    default:
      return 'local:hash-384';
  }
}

// Below this cosine similarity a chunk is not considered "related" to the question.
export function minSimilarity() {
  return env.embeddingProvider === 'local' ? 0.12 : 0.25;
}

async function postJson(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Embedding API error ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function openaiEmbed(texts) {
  const data = await postJson(
    'https://api.openai.com/v1/embeddings',
    { authorization: `Bearer ${env.openaiApiKey}` },
    { model: env.openaiEmbeddingModel, input: texts }
  );
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

async function voyageEmbed(texts, inputType) {
  const data = await postJson(
    'https://api.voyageai.com/v1/embeddings',
    { authorization: `Bearer ${env.voyageApiKey}` },
    { model: env.voyageEmbeddingModel, input: texts, input_type: inputType }
  );
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

const BATCH = 64;

/** Embed many passages (used at upload time). */
export async function embedDocuments(texts) {
  if (env.embeddingProvider === 'local') return texts.map(localEmbed);
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    out.push(...(env.embeddingProvider === 'openai' ? await openaiEmbed(batch) : await voyageEmbed(batch, 'document')));
  }
  return out;
}

/** Embed one question (used at search time). */
export async function embedQuery(text) {
  if (env.embeddingProvider === 'local') return localEmbed(text);
  const [v] = env.embeddingProvider === 'openai' ? await openaiEmbed([text]) : await voyageEmbed([text], 'query');
  return v;
}
