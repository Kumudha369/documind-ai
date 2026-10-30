import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bestExcerpt } from '../src/services/excerpt.js';

test('short text is returned whole', () => {
  assert.equal(bestExcerpt('Hello   world.', 'hello'), 'Hello world.');
});

test('long text: excerpt starts at the sentence that matches the question', () => {
  const filler = 'The weather was pleasant and nothing happened at all. '.repeat(20);
  const text = `${filler}The final deadline for submission is 15 March. ${filler}`;
  const out = bestExcerpt(text, 'What is the submission deadline?', 200);
  assert.match(out, /deadline for submission is 15 March/);
  assert.ok(out.length <= 210);
  assert.ok(out.startsWith('…'));
});
