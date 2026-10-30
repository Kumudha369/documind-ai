import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DocumentPicker from '../components/DocumentPicker.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import SourceCard from '../components/SourceCard.jsx';
import Spinner from '../components/Spinner.jsx';

const SUGGESTIONS = [
  'What is the main objective of this document?',
  'Explain the important concepts in simple language.',
  'List any deadlines mentioned.',
  'What limitations are discussed?',
];

// Turns "[S1, S2]" in an answer into clickable chips that jump to the supporting passage.
function AnswerText({ text, onCite }) {
  const parts = text.split(/(\[S\d+(?:\s*,\s*S\d+)*\])/g);
  return (
    <p className="whitespace-pre-wrap leading-relaxed">
      {parts.map((part, i) => {
        const m = part.match(/^\[(S\d+(?:\s*,\s*S\d+)*)\]$/);
        if (!m) return <span key={i}>{part}</span>;
        return (
          <span key={i}>
            {m[1].split(/\s*,\s*/).map((ref) => (
              <button key={ref} onClick={() => onCite(ref)} className="mx-0.5 rounded bg-brand-100 px-1.5 py-0.5 align-baseline text-xs font-semibold text-brand-700 hover:bg-brand-600 hover:text-white" title={`Show source ${ref}`}>
                {ref}
              </button>
            ))}
          </span>
        );
      })}
    </p>
  );
}

function AssistantMessage({ message, highlight, onCite }) {
  const sources = message.sourceReferences ?? [];
  const cited = sources.filter((s) => s.cited);
  const others = sources.filter((s) => !s.cited);
  const card = (s) => (
    <SourceCard key={s.ref} id={`src-${message.id}-${s.ref}`} source={s} highlighted={highlight?.messageId === message.id && highlight.ref === s.ref} />
  );
  return (
    <div className="max-w-3xl space-y-3">
      <div className={`rounded-2xl rounded-tl-sm border px-4 py-3 text-sm ${message.insufficientEvidence ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white'}`}>
        <AnswerText text={message.content} onCite={(ref) => onCite(message.id, ref)} />
      </div>
      {cited.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sources</p>
          {cited.map(card)}
        </div>
      )}
      {others.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-slate-500">Other passages that were retrieved ({others.length})</summary>
          <div className="mt-2 space-y-2">{others.map(card)}</div>
        </details>
      )}
    </div>
  );
}

export default function Chat() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState(location.state?.documentIds ?? []);
  const [showPicker, setShowPicker] = useState(!!location.state?.documentIds);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [error, setError] = useState('');
  const [highlight, setHighlight] = useState(null);
  const [renaming, setRenaming] = useState(null); // { id, title }
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const justCreated = useRef(null);
  const bottomRef = useRef(null);

  const loadList = useCallback(
    () => api.get('/conversations').then((r) => setConversations(r.data.conversations)).catch((e) => setError(errorMessage(e))),
    []
  );
  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    if (justCreated.current === conversationId) {
      justCreated.current = null; // we already have these messages
      return;
    }
    setLoadingConv(true);
    api
      .get(`/conversations/${conversationId}`)
      .then((r) => {
        setMessages(r.data.messages);
        setSelectedDocs(r.data.conversation.documentIds);
        setError('');
      })
      .catch((e) => {
        setError(errorMessage(e));
        if (e.response?.status === 404 || e.response?.status === 400) navigate('/chat', { replace: true });
      })
      .finally(() => setLoadingConv(false));
  }, [conversationId, navigate]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, sending]);

  const cite = (messageId, ref) => {
    setHighlight({ messageId, ref });
    document.getElementById(`src-${messageId}-${ref}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || sending) return;
    setInput('');
    setError('');
    setSending(true);
    const temp = { id: `tmp-${Date.now()}`, role: 'user', content: question };
    setMessages((m) => [...m, temp]);
    try {
      const r = await api.post('/ai/ask', { question, conversationId, documentIds: selectedDocs }, { timeout: 120000 });
      setMessages((m) => [...m.filter((x) => x.id !== temp.id), r.data.userMessage, r.data.assistantMessage]);
      if (!conversationId) {
        justCreated.current = r.data.conversation.id;
        navigate(`/chat/${r.data.conversation.id}`);
      }
      loadList();
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setInput(question); // give the question back so nothing is lost
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const saveRename = async () => {
    const title = renaming.title.trim();
    if (!title) return setRenaming(null);
    try {
      await api.patch(`/conversations/${renaming.id}`, { title });
      setRenaming(null);
      loadList();
    } catch (err) {
      setError(errorMessage(err));
    }
    return undefined;
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/conversations/${toDelete.id}`);
      if (toDelete.id === conversationId) navigate('/chat');
      setToDelete(null);
      loadList();
    } catch (err) {
      setError(errorMessage(err));
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <aside className="card flex max-h-[30vh] flex-col overflow-hidden md:h-[calc(100vh-8rem)] md:max-h-none">
        <div className="border-b border-slate-100 p-3">
          <button className="btn-primary w-full" onClick={() => navigate('/chat')}>+ New chat</button>
        </div>
        <ul className="flex-1 overflow-y-auto p-2">
          {conversations.length === 0 && <li className="p-3 text-sm text-slate-500">No conversations yet.</li>}
          {conversations.map((c) => (
            <li key={c.id}>
              {renaming?.id === c.id ? (
                <div className="flex gap-1 p-1">
                  <input className="input !py-1" value={renaming.title} maxLength={120} autoFocus onChange={(e) => setRenaming({ ...renaming, title: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(null); }} aria-label="Conversation title" />
                  <button className="btn-primary !px-2 !py-1" onClick={saveRename}>OK</button>
                </div>
              ) : (
                <div className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${c.id === conversationId ? 'bg-brand-100 text-brand-700' : 'hover:bg-slate-100'}`}>
                  <button className="min-w-0 flex-1 truncate text-left" onClick={() => navigate(`/chat/${c.id}`)} title={c.title}>{c.title}</button>
                  <button className="hidden text-xs text-slate-500 hover:text-brand-600 group-hover:inline" onClick={() => setRenaming({ id: c.id, title: c.title })} aria-label={`Rename ${c.title}`}>Rename</button>
                  <button className="hidden text-xs text-slate-500 hover:text-red-600 group-hover:inline" onClick={() => setToDelete(c)} aria-label={`Delete ${c.title}`}>Delete</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </aside>

      <section className="card flex min-h-[60vh] flex-col md:h-[calc(100vh-8rem)]">
        <div className="border-b border-slate-100 p-3">
          <button className="flex w-full items-center justify-between text-sm font-medium text-slate-700" onClick={() => setShowPicker((s) => !s)} aria-expanded={showPicker}>
            <span>Documents to use: {selectedDocs.length ? `${selectedDocs.length} selected` : 'all'}</span>
            <span className="text-slate-400">{showPicker ? '▲' : '▼'}</span>
          </button>
          {showPicker && <div className="mt-3"><DocumentPicker selected={selectedDocs} onChange={setSelectedDocs} /></div>}
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {loadingConv && <div className="flex justify-center"><Spinner className="h-6 w-6" /></div>}
          {!loadingConv && messages.length === 0 && (
            <div className="mx-auto mt-10 max-w-md text-center">
              <h2 className="text-lg font-semibold text-slate-900">Ask your documents anything</h2>
              <p className="mt-1 text-sm text-slate-500">Answers come only from your files, with the supporting passages shown next to them.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-brand-500 hover:text-brand-600" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-xl whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-sm text-white">{m.content}</div>
              </div>
            ) : (
              <AssistantMessage key={m.id} message={m} highlight={highlight} onCite={cite} />
            )
          )}
          {sending && (
            <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Searching your documents…</div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="space-y-2 border-t border-slate-100 p-3">
          <ErrorBanner message={error} onClose={() => setError('')} />
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2">
            <textarea
              className="input resize-none" rows={2} maxLength={2000} placeholder="Ask a question…  (Enter to send, Shift+Enter for a new line)"
              value={input} onChange={(e) => setInput(e.target.value)} aria-label="Your question"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <button className="btn-primary self-end" disabled={sending || !input.trim()}>Send</button>
          </form>
          <p className="text-xs text-slate-400">AI can make mistakes. Use the sources to verify important answers.</p>
        </div>
      </section>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this conversation?"
        message={`“${toDelete?.title}” and all its messages will be permanently removed.`}
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
