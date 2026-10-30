import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage, fileUrl } from '../api/client.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Spinner from '../components/Spinner.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatBytes, formatDateTime, inProgress } from '../utils.js';

const LENGTHS = [
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'long', label: 'Long' },
];

export default function DocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [length, setLength] = useState('medium');
  const [summary, setSummary] = useState(null);
  const [summarizing, setSummarizing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/documents/${id}`);
      setDoc(r.data.document);
    } catch (err) {
      if (err.response?.status === 404 || err.response?.status === 400) setNotFound(true);
      else setError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!doc || !inProgress(doc)) return undefined;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [doc, load]);

  const patch = async (body) => {
    try {
      const r = await api.patch(`/documents/${id}`, body);
      setDoc(r.data.document);
      setError('');
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  };

  const saveName = async () => {
    if (name.trim() && (await patch({ originalFilename: name.trim() }))) setEditing(false);
  };

  const addTag = async (e) => {
    e.preventDefault();
    const t = tagInput.trim().toLowerCase();
    if (!t || doc.tags.includes(t)) return setTagInput('');
    if (await patch({ tags: [...doc.tags, t] })) setTagInput('');
    return undefined;
  };

  const summarize = async (refresh = false) => {
    setSummarizing(true);
    setError('');
    try {
      const r = await api.post('/ai/summarize', { documentId: id, length, refresh }, { timeout: 180000 });
      setSummary(r.data.summary);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSummarizing(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete(`/documents/${id}`);
      navigate('/documents', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setConfirmDelete(false);
      setDeleting(false);
    }
  };

  if (notFound) {
    return (
      <div className="card p-10 text-center">
        <p className="text-slate-600">This document does not exist.</p>
        <Link to="/documents" className="btn-primary mt-4">Back to documents</Link>
      </div>
    );
  }
  if (!doc) return <div className="flex justify-center p-10"><Spinner className="h-6 w-6" /></div>;

  const ready = doc.processingStatus === 'Completed';

  return (
    <div className="space-y-6">
      <Link to="/documents" className="text-sm text-brand-600 hover:underline">← All documents</Link>
      <ErrorBanner message={error} onClose={() => setError('')} />

      <div className="card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {editing ? (
            <div className="flex flex-1 gap-2">
              <input className="input" value={name} maxLength={255} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveName()} aria-label="Document name" autoFocus />
              <button className="btn-primary" onClick={saveName}>Save</button>
              <button className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          ) : (
            <h1 className="break-all text-xl font-bold text-slate-900">
              {doc.originalFilename}{' '}
              <button className="ml-1 text-sm font-medium text-brand-600 hover:underline" onClick={() => { setName(doc.originalFilename); setEditing(true); }}>Rename</button>
            </h1>
          )}
          <StatusBadge status={doc.processingStatus} />
        </div>

        {doc.processingStatus === 'Failed' && <ErrorBanner message={doc.processingError} />}

        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div><dt className="text-slate-500">Type</dt><dd className="font-medium">{doc.fileType.toUpperCase()}</dd></div>
          <div><dt className="text-slate-500">Size</dt><dd className="font-medium">{formatBytes(doc.fileSize)}</dd></div>
          <div><dt className="text-slate-500">Pages</dt><dd className="font-medium">{doc.pageCount ?? '—'}</dd></div>
          <div><dt className="text-slate-500">Passages indexed</dt><dd className="font-medium">{doc.chunkCount}</dd></div>
          <div className="col-span-2"><dt className="text-slate-500">Uploaded</dt><dd className="font-medium">{formatDateTime(doc.createdAt)}</dd></div>
        </dl>

        <div>
          <p className="label">Tags</p>
          <div className="flex flex-wrap items-center gap-2">
            {doc.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs text-brand-700">
                #{t}
                <button aria-label={`Remove tag ${t}`} className="hover:text-red-600" onClick={() => patch({ tags: doc.tags.filter((x) => x !== t) })}>×</button>
              </span>
            ))}
            <form onSubmit={addTag} className="flex gap-2">
              <input className="input !w-32 !py-1" placeholder="Add tag" maxLength={30} value={tagInput} onChange={(e) => setTagInput(e.target.value)} aria-label="New tag" />
              <button className="btn-secondary !py-1">Add</button>
            </form>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <a className="btn-secondary" href={fileUrl(doc.id)} target="_blank" rel="noreferrer">Open original ↗</a>
          <button className="btn-primary" disabled={!ready} onClick={() => navigate('/chat', { state: { documentIds: [doc.id] } })}>Ask questions</button>
          <button className="btn-secondary ml-auto text-red-600 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>Delete</button>
        </div>
      </div>

      <div className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Summary</h2>
          <div className="flex items-center gap-2">
            <select className="input w-auto" value={length} onChange={(e) => { setLength(e.target.value); setSummary(null); }} aria-label="Summary length" disabled={summarizing}>
              {LENGTHS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            <button className="btn-primary" disabled={!ready || summarizing} onClick={() => summarize(false)}>
              {summarizing && <Spinner className="h-4 w-4 !text-white" />} Summarise
            </button>
            {summary && <button className="btn-secondary" disabled={summarizing} onClick={() => summarize(true)}>Regenerate</button>}
          </div>
        </div>

        {!ready && <p className="text-sm text-slate-500">Summaries are available once processing is Completed.</p>}
        {summarizing && <p className="text-sm text-slate-500">Reading the document… long files can take a minute.</p>}

        {summary && (
          <div className="space-y-5 text-sm">
            <section>
              <h3 className="mb-1 font-semibold text-slate-900">In short</h3>
              <p className="text-slate-700">{summary.shortSummary}</p>
            </section>
            <section>
              <h3 className="mb-1 font-semibold text-slate-900">Detailed summary</h3>
              <p className="whitespace-pre-wrap text-slate-700">{summary.detailedSummary}</p>
            </section>
            {summary.keyPoints?.length > 0 && (
              <section>
                <h3 className="mb-1 font-semibold text-slate-900">Key points</h3>
                <ul className="list-disc space-y-1 pl-5 text-slate-700">{summary.keyPoints.map((k, i) => <li key={i}>{k}</li>)}</ul>
              </section>
            )}
            {summary.terms?.length > 0 && (
              <section>
                <h3 className="mb-1 font-semibold text-slate-900">Important terms</h3>
                <dl className="space-y-1 text-slate-700">{summary.terms.map((t, i) => <div key={i}><dt className="inline font-medium">{t.term}: </dt><dd className="inline">{t.definition}</dd></div>)}</dl>
              </section>
            )}
            {summary.actionItems?.length > 0 && (
              <section>
                <h3 className="mb-1 font-semibold text-slate-900">Action items</h3>
                <ul className="list-disc space-y-1 pl-5 text-slate-700">{summary.actionItems.map((k, i) => <li key={i}>{k}</li>)}</ul>
              </section>
            )}
            <p className="text-xs text-slate-400">Generated by {summary.model}. AI summaries can contain mistakes; check important facts in the original.</p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this document?"
        message="The file, its processed text and search data will be permanently removed. Old chat answers keep their quoted excerpts."
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
