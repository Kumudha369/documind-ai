import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client.js';
import AuthCard from '../components/AuthCard.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Spinner from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from ?? '/documents'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate(location.state?.from ?? '/documents', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to your documents"
      footer={<>New here? <Link to="/register" className="font-medium text-brand-600 hover:underline">Create an account</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner message={error} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" required autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner className="h-4 w-4 !text-white" />} Log in
        </button>
      </form>
    </AuthCard>
  );
}
