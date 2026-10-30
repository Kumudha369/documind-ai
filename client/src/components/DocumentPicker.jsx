import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

// Lets the user tick which (finished) documents a question or search should use.
export default function DocumentPicker({ selected, onChange }) {
  const [docs, setDocs] = useState(null);

  useEffect(() => {
    api
      .get('/documents', { params: { status: 'Completed', limit: 50 } })
      .then((r) => setDocs(r.data.documents))
      .catch(() => setDocs([]));
  }, []);

  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  if (docs === null) return <p className="text-sm text-slate-500">Loading documents…</p>;
  if (!docs.length) return <p className="text-sm text-slate-500">No processed documents yet. Upload one first.</p>;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span>{selected.length ? `${selected.length} selected` : 'None selected = search all documents'}</span>
        {selected.length > 0 && (
          <button className="font-medium text-brand-600 hover:underline" onClick={() => onChange([])}>Clear</button>
        )}
      </div>
      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {docs.map((d) => (
          <li key={d.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-100">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} />
              <span className="truncate">{d.originalFilename}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
