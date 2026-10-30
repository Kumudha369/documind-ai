import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl font-bold text-brand-600">404</p>
      <p className="text-slate-600">That page does not exist.</p>
      <Link to="/documents" className="btn-primary">Go to my documents</Link>
    </div>
  );
}
