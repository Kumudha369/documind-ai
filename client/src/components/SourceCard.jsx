import { fileUrl } from '../api/client.js';
import { locationLabel } from '../utils.js';

// One supporting passage: which document, where in it, the text, and a link to open the file.
export default function SourceCard({ source, id, highlighted = false }) {
  const openHref = fileUrl(source.documentId) + (source.pageNumber != null ? `#page=${source.pageNumber}` : '');
  return (
    <div id={id} className={`rounded-lg border p-3 text-sm transition ${highlighted ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 bg-slate-50'}`}>
      <div className="flex flex-wrap items-center gap-2">
        {source.ref && <span className="rounded bg-brand-600 px-1.5 py-0.5 text-xs font-semibold text-white">{source.ref}</span>}
        <span className="font-medium text-slate-800">{source.documentName}</span>
        <span className="text-xs text-slate-500">{locationLabel(source)}</span>
        <a href={openHref} target="_blank" rel="noreferrer" className="ml-auto text-xs font-medium text-brand-600 hover:underline">
          Open document ↗
        </a>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-slate-600">“{source.excerpt}”</p>
    </div>
  );
}
