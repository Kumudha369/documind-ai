import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client.js';
import AuthCard from '../components/AuthCard.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Spinner from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/documents" replace />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(form.name, form.email, form.password);
      navigate('/documents', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Create your account"
      subtitle="Upload documents and ask them questions"
      footer={<>Already registered? <Link to="/login" className="font-medium text-brand-600 hover:underline">Log in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner message={error} />
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" required minLength={2} maxLength={80} autoComplete="name" className="input" value={form.name} onChange={set('name')} />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" className="input" value={form.email} onChange={set('email')} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="input" value={form.password} onChange={set('password')} />
          <p className="mt-1 text-xs text-slate-500">At least 8 characters, with a letter and a number.</p>
        </div>
        <button className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner className="h-4 w-4 !text-white" />} Create account
        </button>
      </form>
    </AuthCard>
  );
}
