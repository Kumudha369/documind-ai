import test from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity, reciprocalRankFusion, TopK } from '../src/services/vector.js';
import { localEmbed, LOCAL_DIM } from '../src/services/localEmbedding.js';

test('cosine similarity basics', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.ok(Math.abs(cosineSimilarity([1, 1], [-1, -1]) + 1) < 1e-9);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
  assert.equal(cosineSimilarity([1, 2], [1, 2, 3]), 0); // mismatched sizes are never "similar"
});

test('local embeddings are unit length and the right size', () => {
  const v = localEmbed('Machine learning models need training data');
  assert.equal(v.length, LOCAL_DIM);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  assert.ok(Math.abs(norm - 1) < 1e-9);
});

test('local embeddings rank a related passage above an unrelated one', () => {
  const q = localEmbed('When is the project submission deadline?');
  const related = localEmbed('The final project submission deadline is 15 March.');
  const unrelated = localEmbed('Photosynthesis converts sunlight into chemical energy in plants.');
  assert.ok(cosineSimilarity(q, related) > cosineSimilarity(q, unrelated));
});

test('local embedding of text with no usable words is the zero vector, not NaN', () => {
  const v = localEmbed('the and of');
  assert.ok(v.every((x) => x === 0));
  assert.equal(cosineSimilarity(v, localEmbed('hello world')), 0);
});

test('RRF rewards items that appear high in both lists', () => {
  const semantic = ['a', 'b', 'c', 'd'];
  const keyword = ['c', 'a', 'x'];
  const fused = reciprocalRankFusion([semantic, keyword]);
  assert.equal(fused[0].id, 'a'); // rank 1 + rank 2
  assert.equal(fused[1].id, 'c'); // rank 3 + rank 1
  assert.ok(fused.every((f) => f.score > 0 && f.score <= 1));
  const ids = fused.map((f) => f.id);
  assert.ok(ids.includes('x') && ids.includes('d'));
});

test('RRF score is 1 only for an item ranked first everywhere', () => {
  const fused = reciprocalRankFusion([['a', 'b'], ['a', 'c']]);
  assert.ok(Math.abs(fused[0].score - 1) < 1e-9);
  assert.ok(fused[1].score < 1);
});

test('TopK keeps only the best k', () => {
  const top = new TopK(3);
  for (let i = 0; i < 100; i++) top.push(`item${i}`, i);
  const result = top.result();
  assert.deepEqual(result.map((r) => r.item), ['item99', 'item98', 'item97']);
});
