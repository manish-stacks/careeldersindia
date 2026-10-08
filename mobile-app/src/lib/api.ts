import * as SecureStore from 'expo-secure-store';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.22:5000').replace(/\/$/, '');
const BASE = `${API_URL}/api/v1`;
const RT_KEY = 'parentcare.refresh_token'; // SecureStore key name only (not a secret)

/** fetch that gives up after `ms` so a wrong server IP shows an error instead of hanging forever. */
async function fetchT(url: string, init: RequestInit, ms = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

export type PageMeta = { page: number; limit: number; total: number; totalPages: number; unread?: number };
export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;
let onSession: ((s: Session) => void) | null = null;
export type Session = { user: import('./types').User; accessToken: string; refreshToken?: string };

export const getAccessToken = () => accessToken;
export const setHandlers = (h: { lost: () => void; session: (s: Session) => void }) => {
  onSessionLost = h.lost;
  onSession = h.session;
};

export async function saveSession(s: Session) {
  accessToken = s.accessToken;
  if (s.refreshToken) await SecureStore.setItemAsync(RT_KEY, s.refreshToken);
}
export async function clearSession() {
  accessToken = null;
  await SecureStore.deleteItemAsync(RT_KEY).catch(() => {});
}
export const storedRefreshToken = () => SecureStore.getItemAsync(RT_KEY);

let refreshing: Promise<Session | null> | null = null;
/** Single-flight refresh; rotation means the stored token changes every time. */
export function refreshSession(): Promise<Session | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const rt = await storedRefreshToken();
      if (!rt) return null;
      try {
        const r = await fetchT(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) });
        if (r.status === 401 || r.status === 403) {
          await clearSession();
          return null;
        }
        if (!r.ok) return null; // server down: keep token for next try
        const j = await r.json();
        const s = j.data as Session;
        await saveSession(s);
        onSession?.(s);
        return s;
      } catch {
        return null;
      }
    })().finally(() => setTimeout(() => (refreshing = null), 0));
  }
  return refreshing;
}

type Opts = { method?: string; body?: unknown; form?: FormData; headers?: Record<string, string>; auth?: boolean; retry?: boolean };

async function request<T>(path: string, o: Opts = {}): Promise<{ data: T; meta?: PageMeta; message: string }> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(o.headers || {}) };
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken && o.auth !== false) headers.Authorization = `Bearer ${accessToken}`;
  let res: Response;
  try {
    res = await fetchT(`${BASE}${path}`, { method: o.method || 'GET', headers, body: o.form ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined) });
  } catch {
    throw new ApiError(`Can't reach the server (${API_URL}). Check internet, and that EXPO_PUBLIC_API_URL is your computer's current IP.`, 0, 'NETWORK');
  }
  if (res.status === 401 && o.auth !== false && o.retry !== false && !path.startsWith('/auth/')) {
    const s = await refreshSession();
    if (s) return request<T>(path, { ...o, retry: false });
    onSessionLost?.();
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) throw new ApiError(j.message || `Something went wrong (${res.status})`, res.status, j.code, j.details);
  return { data: j.data as T, meta: j.meta, message: j.message };
}

export const api = {
  get: async <T>(p: string) => (await request<T>(p)).data,
  page: async <T>(p: string) => {
    const r = await request<T[]>(p);
    return { items: r.data, meta: r.meta as PageMeta };
  },
  post: async <T>(p: string, body?: unknown, headers?: Record<string, string>) => (await request<T>(p, { method: 'POST', body: body ?? {}, headers })).data,
  patch: async <T>(p: string, body?: unknown) => (await request<T>(p, { method: 'PATCH', body: body ?? {} })).data,
  put: async <T>(p: string, body?: unknown) => (await request<T>(p, { method: 'PUT', body: body ?? {} })).data,
  del: async <T>(p: string) => (await request<T>(p, { method: 'DELETE' })).data,
  upload: async <T>(p: string, form: FormData) => (await request<T>(p, { method: 'POST', form })).data,
  public: async <T>(p: string, body: unknown) => (await request<T>(p, { method: 'POST', body, auth: false })).data,
};

/** Signed file links are built from the server's public URL; in development that may say localhost. */
export function fixUrl(url?: string) {
  if (!url) return url;
  return url.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, API_URL);
}

export const qs = (o: Record<string, unknown>) => {
  const s = Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return s ? `?${s}` : '';
};
