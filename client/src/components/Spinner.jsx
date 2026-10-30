export default function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg className={`animate-spin text-brand-600 ${className}`} viewBox="0 0 24 24" fill="none" aria-label="Loading">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-20" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
