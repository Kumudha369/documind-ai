import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Spinner from '../components/Spinner.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatBytes, formatDate, inProgress } from '../utils.js';

const MAX_MB = 15;

export default function Documents() {
  const [docs, setDocs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [tag, setTag] = useState('');
  const [status, setStatus] = useState('');
  const [allTags, setAllTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notes, setNotes] = useState([]);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const params = { page, limit: 10 };
        if (debouncedQ) params.q = debouncedQ;
        if (tag) params.tag = tag;
        if (status) params.status = status;
        const r = await api.get('/documents', { params });
        setDocs(r.data.documents);
        setTotal(r.data.total);
        setPages(r.data.pages);
        if (!silent) setError('');
      } catch (err) {
        if (!silent) setError(errorMessage(err));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [page, debouncedQ, tag, status]
  );

  const loadTags = useCallback(() => api.get('/documents/tags').then((r) => setAllTags(r.data.tags)).catch(() => {}), []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadTags(); }, [loadTags]);

  // While anything is still processing, check again every 2.5 seconds.
  const busyCount = docs.filter(inProgress).length;
  useEffect(() => {
    if (!busyCount) return undefined;
    const id = setInterval(() => load({ silent: true }), 2500);
    return () => clearInterval(id);
  }, [busyCount, load]);

  const upload = async (fileList) => {
    const files = [...fileList];
    if (!files.length) return;
    const problems = [];
    const good = files.filter((f) => {
      const ok = /\.(pdf|txt)$/i.test(f.name);
      if (!ok) problems.push(`${f.name}: only PDF and TXT files are supported.`);
      else if (f.size > MAX_MB * 1024 * 1024) problems.push(`${f.name}: larger than ${MAX_MB} MB.`);
      return ok && f.size <= MAX_MB * 1024 * 1024;
    });
    setNotes(problems);
    if (!good.length) return;

    const form = new FormData();
    good.forEach((f) => form.append('files', f));
    setUploading(true);
    setError('');
    try {
      const r = await api.post('/documents/upload', form);
      setNotes([...problems, ...r.data.rejected.map((x) => `${x.filename}: ${x.reason}`)]);
      setPage(1);
      await load({ silent: true });
      loadTags();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const retry = async (id) => {
    try {
      await api.post(`/documents/${id}/retry`);
      load({ silent: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/documents/${toDelete.id}`);
      setToDelete(null);
      await load({ silent: true });
      loadTags();
    } catch (err) {
      setError(errorMessage(err));
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My documents</h1>
        <p className="text-sm text-slate-500">Upload PDF or TXT files, then summarise them, ask questions or search across them.</p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
        className={`card flex flex-col items-center gap-2 border-2 border-dashed px-4 py-8 text-center transition ${dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300'}`}
      >
        <p className="text-sm text-slate-600">Drag files here, or</p>
        <input ref={fileInput} type="file" multiple accept=".pdf,.txt,application/pdf,text/plain" className="hidden" id="file-input" onChange={(e) => upload(e.target.files)} />
        <label htmlFor="file-input" className={`btn-primary cursor-pointer ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
          {uploading && <Spinner className="h-4 w-4 !text-white" />} Choose files
        </label>
        <p className="text-xs text-slate-400">PDF or TXT, up to {MAX_MB} MB each. Scanned (image-only) PDFs are not supported.</p>
      </div>

      <ErrorBanner message={error} onClose={() => setError('')} />
      {notes.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {notes.map((n) => <p key={n}>{n}</p>)}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input className="input max-w-xs" placeholder="Search by name or tag…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search documents" />
        <select className="input w-auto" value={tag} onChange={(e) => { setTag(e.target.value); setPage(1); }} aria-label="Filter by tag">
          <option value="">All tags</option>
          {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="input w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status">
          <option value="">Any status</option>
          {['Uploaded', 'Processing', 'Completed', 'Failed'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="ml-auto text-sm text-slate-500">{total} document{total === 1 ? '' : 's'}</span>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-10"><Spinner className="h-6 w-6" /></div>
        ) : docs.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">{q || tag || status ? 'No documents match your filters.' : 'No documents yet. Upload your first one above.'}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link to={`/documents/${d.id}`} className="block truncate font-medium text-slate-900 hover:text-brand-600">{d.originalFilename}</Link>
                  <p className="text-xs text-slate-500">
                    {d.fileType.toUpperCase()} · {formatBytes(d.fileSize)}
                    {d.pageCount ? ` · ${d.pageCount} pages` : ''} · {formatDate(d.createdAt)}
                  </p>
                  {d.processingStatus === 'Failed' && <p className="mt-1 text-xs text-red-600">{d.processingError}</p>}
                  {d.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.tags.map((t) => (
                        <button key={t} onClick={() => { setTag(t); setPage(1); }} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700 hover:bg-brand-100">#{t}</button>
                      ))}
                    </div>
                  )}
                </div>
                <StatusBadge status={d.processingStatus} />
                <div className="flex gap-2">
                  {d.processingStatus === 'Failed' && <button className="btn-secondary !py-1" onClick={() => retry(d.id)}>Retry</button>}
                  <Link to={`/documents/${d.id}`} className="btn-secondary !py-1">Details</Link>
                  <button className="btn-secondary !py-1 text-red-600 hover:bg-red-50" onClick={() => setToDelete(d)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button className="btn-secondary !py-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {page} of {pages}</span>
          <button className="btn-secondary !py-1" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this document?"
        message={`“${toDelete?.originalFilename}” and all its processed text and search data will be permanently removed. This cannot be undone.`}
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
