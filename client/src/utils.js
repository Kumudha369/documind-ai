export function formatBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export const formatDateTime = (d) =>
  d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

// Where in the document a passage sits. Only real data is shown, nothing is guessed.
export function locationLabel(s) {
  if (s.pageNumber != null) return `Page ${s.pageNumber}`;
  if (s.startLine != null) return s.startLine === s.endLine ? `Line ${s.startLine}` : `Lines ${s.startLine}–${s.endLine}`;
  return `Section ${(s.chunkIndex ?? 0) + 1}`;
}

export const inProgress = (d) => d.processingStatus === 'Uploaded' || d.processingStatus === 'Processing';
