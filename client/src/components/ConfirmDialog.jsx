import { useEffect } from 'react';
import Spinner from './Spinner.jsx';

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', busy = false, onConfirm, onCancel }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title" className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn-danger" onClick={onConfirm} disabled={busy}>
            {busy && <Spinner className="h-4 w-4 !text-white" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
