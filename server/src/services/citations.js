// Helpers for building the prompt safely and checking the model's citations.
// Pure functions, unit-tested.

/** Neutralise anything that could look like markup so a document cannot "close" our <source> tag. */
export function escapeForPrompt(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Wrap retrieved passages as clearly-labelled DATA.
 * sources: [{ ref: 'S1', documentName, pageNumber, startLine, endLine, text }]
 */
export function buildSourcesBlock(sources) {
  const body = sources
    .map((s) => {
      const where =
        s.pageNumber != null
          ? ` page="${s.pageNumber}"`
          : s.startLine != null
            ? ` lines="${s.startLine}-${s.endLine}"`
            : '';
      return `<source id="${s.ref}" document="${escapeForPrompt(s.documentName)}"${where}>\n${escapeForPrompt(s.text)}\n</source>`;
    })
    .join('\n\n');
  return `<sources>\n${body}\n</sources>`;
}

/**
 * Finds [S1] / [S1, S3] style citations, drops any that point to a source that was never
 * provided (the model cannot invent references), and reports which ones were really used.
 */
export function processCitations(answer, sourceCount) {
  const cited = new Set();
  const cleaned = answer.replace(/\[\s*(S\d+(?:\s*,\s*S\d+)*)\s*\]/g, (_m, group) => {
    const valid = group
      .split(/\s*,\s*/)
      .map((r) => Number.parseInt(r.slice(1), 10))
      .filter((n) => n >= 1 && n <= sourceCount);
    valid.forEach((n) => cited.add(n));
    return valid.length ? `[${valid.map((n) => `S${n}`).join(', ')}]` : '';
  });
  return { text: cleaned.replace(/[ \t]{2,}/g, ' ').trim(), cited };
}

export const INSUFFICIENT_MARKER = 'INSUFFICIENT_EVIDENCE';

export function isInsufficient(answer) {
  return answer.trim().startsWith(INSUFFICIENT_MARKER);
}

export function stripInsufficientMarker(answer) {
  return answer.replace(INSUFFICIENT_MARKER, '').replace(/^[\s:.-]+/, '').trim();
}
