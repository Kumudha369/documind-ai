import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client.js';
import DocumentPicker from '../components/DocumentPicker.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import SourceCard from '../components/SourceCard.jsx';
import Spinner from '../components/Spinner.jsx';

const MODES = [
  { value: 'hybrid', label: 'Hybrid (recommended)', help: 'Combines meaning-based and keyword results.' },
  { value: 'semantic', label: 'Semantic', help: 'Finds passages with similar meaning, even with different words.' },
  { value: 'keyword', label: 'Keyword', help: 'Finds passages containing your exact words.' },
];

export default function Search() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('hybrid');
  const [selected, setSelected] = useState([]);
  const [tags, setTags] = useState('');
  const [docName, setDocName] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const run = async (e) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setLoading(true);
    setError('');
    try {
      const body = { query: query.trim(), mode };
      if (selected.length) body.documentIds = selected;
      const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
      if (tagList.length) body.tags = tagList;
      if (docName.trim()) body.documentName = docName.trim();
      const r = await api.post('/ai/search', body);
      setData(r.data);
    } catch (err) {
      setData(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Search across documents</h1>
        <p className="text-sm text-slate-500">Find the passages that match, with the source of each result.</p>
      </div>

      <form onSubmit={run} className="card space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          <input className="input min-w-[16rem] flex-1" placeholder="e.g. payment deadline, risk factors, installation steps…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search query" />
          <select className="input w-auto" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Search mode">
            {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button className="btn-primary" disabled={loading || query.trim().length < 2}>
            {loading && <Spinner className="h-4 w-4 !text-white" />} Search
          </button>
        </div>
        <p className="text-xs text-slate-500">{MODES.find((m) => m.value === mode).help}</p>

        <button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={() => setShowFilters((s) => !s)}>
          {showFilters ? 'Hide filters' : 'Filters (documents, tags, name)'}
          {selected.length || tags || docName ? ' •' : ''}
        </button>
        {showFilters && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="label">Limit to documents</p>
              <DocumentPicker selected={selected} onChange={setSelected} />
            </div>
            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="tags">Tags (comma separated)</label>
                <input id="tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="finance, 2026" />
              </div>
              <div>
                <label className="label" htmlFor="dname">Document name contains</label>
                <input id="dname" className="input" value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="report" />
              </div>
            </div>
          </div>
        )}
      </form>

      <ErrorBanner message={error} onClose={() => setError('')} />

      {data && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            {data.results.length} passage{data.results.length === 1 ? '' : 's'} found in {data.searchedDocuments} document{data.searchedDocuments === 1 ? '' : 's'}.
          </p>

          {data.documentMatches.length > 0 && (
            <div className="card p-4">
              <p className="mb-2 text-sm font-semibold text-slate-800">Documents whose name or tags match</p>
              <div className="flex flex-wrap gap-2">
                {data.documentMatches.map((d) => (
                  <Link key={d.id} to={`/documents/${d.id}`} className="rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700 hover:bg-brand-100">{d.originalFilename}</Link>
                ))}
              </div>
            </div>
          )}

          {data.results.length === 0 ? (
            <p className="card p-8 text-center text-sm text-slate-500">No matching passages. Try different words or the Hybrid mode.</p>
          ) : (
            <ol className="space-y-3">
              {data.results.map((r, i) => (
                <li key={r.chunkId} className="card p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-500">#{i + 1}</span>
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100" title={`Relevance ${(r.score * 100).toFixed(0)}%`}>
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(4, r.score * 100)}%` }} />
                    </div>
                    <span className="text-slate-500">{(r.score * 100).toFixed(0)}% relevance</span>
                    {r.semanticScore != null && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">meaning match {(r.semanticScore * 100).toFixed(0)}%</span>}
                    {r.keywordMatch && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">keyword match</span>}
                  </div>
                  <SourceCard source={r} />
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
