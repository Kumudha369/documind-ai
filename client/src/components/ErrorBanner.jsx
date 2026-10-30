export default function ErrorBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span>{message}</span>
      {onClose && (
        <button onClick={onClose} className="font-medium hover:underline" aria-label="Dismiss">
          Dismiss
        </button>
      )}
    </div>
  );
}
