// Splits text into overlapping chunks.
//
// Why chunk?  LLMs and embedding models work on limited text, and a small passage
// gives a much sharper search match than a whole book.
// Why overlap? A sentence that sits on a boundary would otherwise be cut in half and
// could be missed by search. Overlap repeats the last ~200 characters in the next chunk.
//
// Pure functions only (no database, no config) so they are easy to unit test.

/** Split text into "units" (sentences / paragraphs) and remember where each one sits. */
function splitUnits(text) {
  const units = [];
  const push = (start, end) => {
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    if (end > start) units.push({ start, end });
  };
  const boundary = /\n{2,}|(?<=[.!?])\s+/g;
  let last = 0;
  let m;
  while ((m = boundary.exec(text)) !== null) {
    push(last, m.index);
    last = m.index + m[0].length;
  }
  push(last, text.length);
  return units;
}

/** A single unit longer than chunkSize (e.g. a huge paragraph with no full stops) is cut at spaces. */
function hardSplit(unit, text, size) {
  const out = [];
  let s = unit.start;
  while (unit.end - s > size) {
    let e = s + size;
    const lastSpace = text.slice(s, e).search(/\s\S*$/);
    if (lastSpace > size * 0.5) e = s + lastSpace;
    out.push({ start: s, end: e });
    s = e;
    while (s < unit.end && /\s/.test(text[s])) s++;
  }
  if (s < unit.end) out.push({ start: s, end: unit.end });
  return out;
}

/**
 * @param {string} text
 * @param {{chunkSize?: number, overlap?: number}} opts
 * @returns {{text: string, startOffset: number, endOffset: number}[]}
 */
export function chunkText(text, { chunkSize = 1000, overlap = 200 } = {}) {
  if (overlap >= chunkSize) throw new Error('overlap must be smaller than chunkSize');

  const units = splitUnits(text).flatMap((u) =>
    u.end - u.start > chunkSize ? hardSplit(u, text, chunkSize) : [u]
  );

  const chunks = [];
  let current = [];
  let lastEmittedEnd = -1;

  const span = (arr) => (arr.length ? arr[arr.length - 1].end - arr[0].start : 0);
  const emit = () => {
    const start = current[0].start;
    const end = current[current.length - 1].end;
    chunks.push({ text: text.slice(start, end), startOffset: start, endOffset: end });
    lastEmittedEnd = end;
  };

  for (const unit of units) {
    if (current.length && unit.end - current[0].start > chunkSize) {
      emit();
      // keep only the trailing units that fit inside the overlap window
      while (current.length && span(current) > overlap) current.shift();
      while (current.length && unit.end - current[0].start > chunkSize) current.shift();
    }
    current.push(unit);
  }
  if (current.length && current[current.length - 1].end > lastEmittedEnd) emit();

  return chunks;
}

/** Collapse messy whitespace (used for PDF text, which has lots of stray spaces). */
export function normalizeWhitespace(s) {
  return s
    .replace(/\u0000/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function lineIndex(text) {
  const newlines = [];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') newlines.push(i);
  // 1-based line number of a character offset, using binary search
  return (offset) => {
    let lo = 0;
    let hi = newlines.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (newlines[mid] < offset) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  };
}

/**
 * Chunk a whole document.
 * pages: [{ pageNumber: number | null, text: string }]
 *  - PDF: one entry per page, so every chunk keeps a trustworthy page number
 *    (chunks never cross a page boundary).
 *  - TXT: one entry with pageNumber null; chunks get start/end line numbers instead.
 */
export function chunkDocument(pages, opts) {
  const result = [];
  for (const page of pages) {
    if (!page.text || !page.text.trim()) continue;
    const lineOf = page.pageNumber === null ? lineIndex(page.text) : null;
    for (const c of chunkText(page.text, opts)) {
      result.push({
        text: c.text,
        pageNumber: page.pageNumber,
        startLine: lineOf ? lineOf(c.startOffset) : null,
        endLine: lineOf ? lineOf(Math.max(c.startOffset, c.endOffset - 1)) : null,
      });
    }
  }
  return result;
}
