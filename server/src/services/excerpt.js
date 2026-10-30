import { tokenize } from './localEmbedding.js';

/**
 * Shows the part of a chunk that best matches the question, instead of always its first lines.
 * Scores each sentence by how many question words it contains and starts the excerpt there.
 */
export function bestExcerpt(text, query, max = 450) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;

  const wanted = new Set(tokenize(query));
  const sentences = [...clean.matchAll(/[^.!?]+[.!?]*\s*/g)];
  let bestStart = 0;
  let bestScore = -1;
  for (const m of sentences) {
    const hits = tokenize(m[0]).filter((t) => wanted.has(t)).length;
    if (hits > bestScore) {
      bestScore = hits;
      bestStart = m.index;
    }
  }

  let slice = clean.slice(bestStart, bestStart + max);
  const cut = bestStart + max < clean.length;
  if (cut) {
    const lastSpace = slice.lastIndexOf(' ');
    if (lastSpace > max * 0.6) slice = slice.slice(0, lastSpace);
  }
  return `${bestStart > 0 ? '… ' : ''}${slice.trim()}${cut ? ' …' : ''}`;
}
