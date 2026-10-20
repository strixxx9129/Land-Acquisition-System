import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthUser, LoginResponse, PermissionCode } from '@lams/shared';
import { api, onSessionExpired, refreshSession, setAccessToken } from './api';

interface AuthContextValue {
  user: AuthUser | null;
  /** True until we know whether a previous session can be resumed. */
  loading: boolean;
  login(email: string, password: string): Promise<AuthUser>;
  logout(): Promise<void>;
  can(permission: PermissionCode): boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    onSessionExpired(() => setUser(null));
    // Resume a session from the refresh cookie, if any. This is also the first request, so it
    // is what wakes a sleeping server.
    refreshSession()
      .then((s) => setUser(s?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<LoginResponse>('/auth/login', { method: 'POST', body: { email, password } });
    setAccessToken(res.accessToken);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout, can: (p) => !!user?.permissions.includes(p) }),
    [user, loading, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
