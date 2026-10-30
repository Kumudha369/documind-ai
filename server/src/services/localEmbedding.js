// A tiny offline "embedding": hashed bag-of-words (the "hashing trick").
//
// Each word (and each pair of neighbouring words) is hashed to one of 384 slots and
// counted, then the vector is scaled to length 1. Texts sharing words get similar vectors.
//
// IMPORTANT: this matches WORDS, not MEANING. "car" and "automobile" look unrelated to it.
// It exists so the whole app runs with zero API keys (development, tests, demos).
// Use EMBEDDING_PROVIDER=openai or voyage for real semantic search.

export const LOCAL_DIM = 384;

const STOPWORDS = new Set(
  'a an and are as at be but by for from has have he her his i if in into is it its of on or our she so that the their them they this to was we were what when where which who will with you your not no do does did can could should would about than then there these those'.split(
    ' '
  )
);

function fnv1a(str, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function stem(word) {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function tokenize(text) {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.filter((w) => w.length > 1 && !STOPWORDS.has(w)).map(stem);
}

export function localEmbed(text) {
  const vec = new Array(LOCAL_DIM).fill(0);
  const tokens = tokenize(text);
  const counts = new Map();

  const add = (feature, weight) => counts.set(feature, (counts.get(feature) ?? 0) + weight);
  tokens.forEach((t, i) => {
    add(t, 1);
    if (i + 1 < tokens.length) add(`${t} ${tokens[i + 1]}`, 0.5);
  });

  for (const [feature, count] of counts) {
    const slot = fnv1a(feature) % LOCAL_DIM;
    const sign = fnv1a(feature, 0x9747b28c) & 1 ? 1 : -1; // random sign reduces collisions bias
    vec[slot] += sign * (1 + Math.log(count));
  }

  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}
