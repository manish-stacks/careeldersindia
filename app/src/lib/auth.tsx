import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, clearSession, refreshSession, saveSession, setHandlers, storedRefreshToken, type Session } from './api';
import { unregisterPush } from './push';
import type { User } from './types';

type Ctx = {
  user: User | null;
  ready: boolean;
  signIn: (identifier: string, password: string) => Promise<User>;
  signUp: (path: '/auth/register' | '/auth/register/assistant', body: unknown) => Promise<User>;
  signOut: () => Promise<void>;
  setUser: (u: User) => void;
};
const AuthCtx = createContext<Ctx>(null as unknown as Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    setHandlers({
      lost: () => {
        setUser(null);
        qc.clear();
      },
      session: (s) => setUser(s.user),
    });
    refreshSession()
      .then((s) => s && setUser(s.user))
      .finally(() => setReady(true));
  }, [qc]);

  const accept = useCallback(async (s: Session) => {
    if (s.user.role === 'ADMIN' || !s.refreshToken) {
      await api.post('/auth/logout').catch(() => {});
      throw new Error('Admin accounts use the web console. Please sign in on a computer.');
    }
    await saveSession(s);
    setUser(s.user);
    return s.user;
  }, []);

  const signIn = useCallback(async (identifier: string, password: string) => accept(await api.public<Session>('/auth/login', { identifier, password, portal: 'MOBILE' })), [accept]);
  const signUp = useCallback(async (path: '/auth/register' | '/auth/register/assistant', body: unknown) => accept(await api.public<Session>(path, body)), [accept]);

  const signOut = useCallback(async () => {
    await unregisterPush().catch(() => {});
    const rt = await storedRefreshToken();
    await api.post('/auth/logout', { refreshToken: rt }).catch(() => {});
    await clearSession();
    qc.clear();
    setUser(null);
  }, [qc]);

  return <AuthCtx.Provider value={{ user, ready, signIn, signUp, signOut, setUser }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
