import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, chunkDocument, normalizeWhitespace } from '../src/services/chunker.js';

const sentence = (n) => `This is sentence number ${n} about topic ${n % 7}.`;
const longText = Array.from({ length: 80 }, (_, i) => sentence(i)).join(' ');

test('chunks never exceed the chunk size', () => {
  const chunks = chunkText(longText, { chunkSize: 300, overlap: 60 });
  assert.ok(chunks.length > 5);
  for (const c of chunks) assert.ok(c.text.length <= 300, `chunk too long: ${c.text.length}`);
});

test('consecutive chunks overlap and together cover the whole text', () => {
  const chunks = chunkText(longText, { chunkSize: 300, overlap: 80 });
  for (let i = 1; i < chunks.length; i++) {
    assert.ok(chunks[i].startOffset < chunks[i - 1].endOffset, 'expected overlap');
    assert.ok(chunks[i].startOffset > chunks[i - 1].startOffset, 'expected forward progress');
  }
  assert.equal(chunks[0].startOffset, 0);
  assert.equal(chunks.at(-1).endOffset, longText.length);
});

test('short text gives a single chunk', () => {
  const chunks = chunkText('Just one short sentence.', { chunkSize: 1000, overlap: 200 });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].text, 'Just one short sentence.');
});

test('a huge paragraph with no punctuation is still split', () => {
  const blob = 'word '.repeat(1000).trim();
  const chunks = chunkText(blob, { chunkSize: 400, overlap: 50 });
  assert.ok(chunks.length >= 12);
  for (const c of chunks) assert.ok(c.text.length <= 400);
});

test('overlap must be smaller than chunk size', () => {
  assert.throws(() => chunkText('abc', { chunkSize: 100, overlap: 100 }));
});

test('empty text gives no chunks', () => {
  assert.deepEqual(chunkText('   \n\n  ', { chunkSize: 100, overlap: 10 }), []);
});

test('PDF pages keep their own page number and chunks never cross pages', () => {
  const pages = [
    { pageNumber: 1, text: 'Alpha beta gamma. Delta epsilon.' },
    { pageNumber: 2, text: 'Second page content here.' },
  ];
  const chunks = chunkDocument(pages, { chunkSize: 1000, overlap: 100 });
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks.map((c) => c.pageNumber), [1, 2]);
  assert.ok(chunks.every((c) => c.startLine === null));
});

test('TXT chunks get line numbers instead of page numbers', () => {
  const lines = Array.from({ length: 30 }, (_, i) => `Line ${i + 1} has some words in it.`);
  const chunks = chunkDocument([{ pageNumber: null, text: lines.join('\n') }], {
    chunkSize: 200,
    overlap: 40,
  });
  assert.ok(chunks.length > 1);
  assert.equal(chunks[0].pageNumber, null);
  assert.equal(chunks[0].startLine, 1);
  assert.ok(chunks.at(-1).endLine <= 30);
  assert.ok(chunks.every((c) => c.endLine >= c.startLine));
});

test('normalizeWhitespace tidies PDF-style text', () => {
  assert.equal(normalizeWhitespace('a   b \n\n\n\n c\u0000'), 'a b\n\nc');
});
