// Vector maths and rank fusion. Pure functions, no dependencies.

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Keeps only the best `k` items while streaming through a large collection,
 * so we never hold every chunk's score in memory at once.
 */
export class TopK {
  constructor(k) {
    this.k = k;
    this.items = [];
  }
  push(item, score) {
    this.items.push({ item, score });
    if (this.items.length > this.k * 4) this.#trim();
  }
  #trim() {
    this.items.sort((x, y) => y.score - x.score);
    this.items.length = Math.min(this.items.length, this.k);
  }
  result() {
    this.#trim();
    return this.items;
  }
}

/**
 * Reciprocal Rank Fusion (RRF).
 * Each input list is ordered best-first and contains ids. An id's fused score is
 *    sum over lists of  1 / (k + rank)
 * so something ranked high in BOTH the semantic and keyword list beats something that is
 * only #1 in one of them. It needs no score calibration between the two methods, which is
 * why it is the standard way to combine them.
 * Returns items sorted best-first with `score` normalised to 0..1
 * (1 = ranked first in every list).
 */
export function reciprocalRankFusion(lists, { k = 60 } = {}) {
  const scores = new Map();
  lists.forEach((list) => {
    list.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  });
  const max = lists.length / (k + 1);
  return [...scores.entries()]
    .map(([id, raw]) => ({ id, score: max > 0 ? raw / max : 0 }))
    .sort((a, b) => b.score - a.score);
}
