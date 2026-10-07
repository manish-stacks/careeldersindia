'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { get, post, refreshSession, setAccessToken, setSessionLostHandler } from './api';
import type { User } from './types';

type AuthState = { user: User | null; ready: boolean; login: (identifier: string, password: string) => Promise<void>; logout: () => Promise<void>; can: (perm?: string) => boolean };
const AuthCtx = createContext<AuthState>({ user: null, ready: false, login: async () => {}, logout: async () => {}, can: () => false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    setSessionLostHandler(() => {
      setUser(null);
      qc.clear();
      router.replace('/login?expired=1');
    });
    // Restore session from the httpOnly refresh cookie
    (async () => {
      const token = await refreshSession();
      if (token) {
        try {
          const me = await get<{ user: User }>('/auth/me');
          setUser(me.user);
        } catch {
          setAccessToken(null);
        }
      }
      setReady(true);
    })();
  }, [qc, router]);

  const login = useCallback(async (identifier: string, password: string) => {
    const r = await post<{ user: User; accessToken: string }>('/auth/login', { identifier, password, portal: 'ADMIN' });
    setAccessToken(r.data.accessToken);
    setUser(r.data.user);
  }, []);

  const logout = useCallback(async () => {
    await post('/auth/logout').catch(() => {});
    setAccessToken(null);
    setUser(null);
    qc.clear();
    router.replace('/login');
  }, [qc, router]);

  const can = useCallback((perm?: string) => !perm || !!user?.isSuper || !!user?.permissions?.includes(perm), [user]);

  return <AuthCtx.Provider value={{ user, ready, login, logout, can }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
