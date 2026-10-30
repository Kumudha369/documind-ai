import { env } from '../config/env.js';

export const isMockLlm = () => env.llmProvider === 'mock';

export function llmModelName() {
  if (env.llmProvider === 'anthropic') return env.anthropicModel;
  if (env.llmProvider === 'openai') return env.openaiChatModel;
  return 'mock-extractive';
}

async function postJson(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`LLM API error ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * One function for every provider.
 * messages: [{ role: 'user' | 'assistant', content: string }]
 * Returns the plain text of the reply.
 * Retries once on rate limits / temporary server errors.
 */
export async function complete({ system, messages, maxTokens = 1500, temperature = 0.2 }) {
  if (isMockLlm()) throw new Error('complete() must not be called when LLM_PROVIDER=mock');

  const attempt = async () => {
    if (env.llmProvider === 'anthropic') {
      const data = await postJson(
        'https://api.anthropic.com/v1/messages',
        { 'x-api-key': env.anthropicApiKey, 'anthropic-version': '2023-06-01' },
        { model: env.anthropicModel, max_tokens: maxTokens, temperature, system, messages }
      );
      return data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    }
    const data = await postJson(
      'https://api.openai.com/v1/chat/completions',
      { authorization: `Bearer ${env.openaiApiKey}` },
      {
        model: env.openaiChatModel,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'system', content: system }, ...messages],
      }
    );
    return data.choices[0].message.content ?? '';
  };

  try {
    return await attempt();
  } catch (err) {
    if (err.status === 429 || err.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500));
      return attempt();
    }
    throw err;
  }
}

/** Pull a JSON object out of a model reply even if it wrapped it in ```json fences or added chatter. */
export function parseJsonLoose(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Model did not return JSON.');
  return JSON.parse(cleaned.slice(start, end + 1));
}
