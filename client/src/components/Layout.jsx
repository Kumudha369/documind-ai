import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const link = ({ isActive }) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${isActive ? 'bg-brand-100 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`;

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-6">
            <NavLink to="/documents" className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-sm text-white">D</span>
              DocuMind <span className="text-brand-600">AI</span>
            </NavLink>
            <nav className="flex gap-1" aria-label="Main">
              <NavLink to="/documents" className={link}>Documents</NavLink>
              <NavLink to="/chat" className={link}>Chat</NavLink>
              <NavLink to="/search" className={link}>Search</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-500 sm:inline">{user?.name}</span>
            <button onClick={logout} className="btn-secondary !py-1.5">Log out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
