const STYLES = {
  Uploaded: 'bg-slate-100 text-slate-700',
  Processing: 'bg-amber-100 text-amber-800',
  Completed: 'bg-emerald-100 text-emerald-800',
  Failed: 'bg-red-100 text-red-700',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status] ?? STYLES.Uploaded}`}>
      {(status === 'Processing' || status === 'Uploaded') && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {status}
    </span>
  );
}
