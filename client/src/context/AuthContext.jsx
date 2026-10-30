import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true while we ask the server "who am I?"

  useEffect(() => {
    api
      .get('/auth/me')
      .then((r) => setUser(r.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // A 401 from any later request means the session ended: send the user to login.
  useEffect(() => {
    const id = api.interceptors.response.use(
      (r) => r,
      (err) => {
        const url = err.config?.url ?? '';
        if (err.response?.status === 401 && !url.startsWith('/auth/')) setUser(null);
        return Promise.reject(err);
      }
    );
    return () => api.interceptors.response.eject(id);
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    setUser(r.data.user);
  }, []);
  const register = useCallback(async (name, email, password) => {
    const r = await api.post('/auth/register', { name, email, password });
    setUser(r.data.user);
  }, []);
  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
