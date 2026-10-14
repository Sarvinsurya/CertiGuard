import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { fetchMe, logout as apiLogout, setCsrfToken, type MeUser } from "../api/client";

interface AuthState {
  user: MeUser | null;
  permissions: string[];
  loading: boolean;
  mfaPending: boolean;
  refresh: () => Promise<void>;
  setSession: (csrfToken: string, user?: MeUser) => void;
  signOut: () => Promise<void>;
  can: (perm: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [mfaPending, setMfaPending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchMe();
      if (data.mfaPending) {
        setMfaPending(true);
        setUser(null);
        setPermissions([]);
      } else if (data.user) {
        setUser(data.user);
        setPermissions(data.permissions ?? data.user.permissions ?? []);
        setMfaPending(false);
        if (data.csrfToken) setCsrfToken(data.csrfToken);
      } else {
        setUser(null);
        setPermissions([]);
        setMfaPending(false);
      }
    } catch {
      setUser(null);
      setPermissions([]);
      setMfaPending(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setSession = useCallback((csrfToken: string, u?: MeUser) => {
    setCsrfToken(csrfToken);
    if (u) {
      setUser(u);
      setPermissions(u.permissions ?? []);
      setMfaPending(false);
    }
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try { await apiLogout(); } catch { /* ignore */ }
    setCsrfToken(null);
    setUser(null);
    setPermissions([]);
    setMfaPending(false);
  }, []);

  const can = useCallback((perm: string) => permissions.includes(perm), [permissions]);

  return (
    <AuthContext.Provider value={{ user, permissions, loading, mfaPending, refresh, setSession, signOut, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
