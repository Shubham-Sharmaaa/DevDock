import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { setAccessToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On first mount, try to silently re-establish a session using whatever
  // refresh cookie the browser already has (e.g. the user refreshed the
  // page). If there's no valid cookie this just fails quietly.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const { data } = await api.post('/auth/refresh');
        if (cancelled) return;
        setAccessToken(data.accessToken);
        setUser(data.user);
      } catch {
        // Not logged in -- that's a normal state, not an error to surface.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const register = useCallback(async ({ username, email, password }) => {
    const { data } = await api.post('/auth/register', { username, email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const login = useCallback(async ({ identifier, password }) => {
    const { data } = await api.post('/auth/login', { identifier, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const updateBio = useCallback(async (bio) => {
    const { data } = await api.patch('/auth/me', { bio });
    setUser(data.user);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, register, login, logout, updateBio }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an <AuthProvider>');
  }
  return ctx;
}
