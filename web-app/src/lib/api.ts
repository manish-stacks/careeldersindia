import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5201').replace(/\/$/, '');

export type ApiEnvelope<T> = { success: boolean; message: string; data: T; meta?: PageMeta & { unread?: number } };
export type PageMeta = { page: number; limit: number; total: number; totalPages: number };
export class ApiFailure extends Error {
  status?: number;
  code?: string;
  details?: unknown;
  constructor(message: string, status?: number, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Access token lives in memory only. Refresh token is an httpOnly cookie scoped to /api/v1/auth.
let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;
export const setAccessToken = (t: string | null) => (accessToken = t);
export const getAccessToken = () => accessToken;
export const setSessionLostHandler = (fn: () => void) => (onSessionLost = fn);

export const http = axios.create({ baseURL: `${API_URL}/api/v1`, withCredentials: true, timeout: 20000 });

http.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;
export async function refreshSession(): Promise<string | null> {
  if (!refreshing) {
    refreshing = axios
      .post(`${API_URL}/api/v1/auth/refresh`, {}, { withCredentials: true })
      .then((r) => {
        const t = r.data?.data?.accessToken as string;
        setAccessToken(t);
        return t;
      })
      .catch(() => null)
      .finally(() => {
        setTimeout(() => (refreshing = null), 0);
      });
  }
  return refreshing;
}

http.interceptors.response.use(
  (r) => r,
  async (error: AxiosError<{ message?: string; code?: string; details?: unknown }>) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };
    const code = error.response?.data?.code;
    if (error.response?.status === 401 && !original?._retry && !original?.url?.includes('/auth/')) {
      original._retry = true;
      const t = await refreshSession();
      if (t) {
        original.headers = { ...(original.headers || {}), Authorization: `Bearer ${t}` };
        return http(original);
      }
      setAccessToken(null);
      onSessionLost?.();
    }
    const msg = error.response?.data?.message || (error.code === 'ECONNABORTED' ? 'The server took too long to respond' : error.message === 'Network Error' ? 'Cannot reach the server' : error.message);
    return Promise.reject(new ApiFailure(msg, error.response?.status, code, error.response?.data?.details));
  }
);

export async function get<T>(url: string) {
  const r = await http.get<ApiEnvelope<T>>(url);
  return r.data.data;
}
export async function getPaged<T>(url: string) {
  const r = await http.get<ApiEnvelope<T[]>>(url);
  return { items: r.data.data, meta: r.data.meta as PageMeta };
}
export async function post<T>(url: string, body?: unknown) {
  const r = await http.post<ApiEnvelope<T>>(url, body ?? {});
  return r.data;
}
export async function patch<T>(url: string, body?: unknown) {
  const r = await http.patch<ApiEnvelope<T>>(url, body ?? {});
  return r.data;
}
export async function del<T>(url: string) {
  const r = await http.delete<ApiEnvelope<T>>(url);
  return r.data;
}

export async function put<T>(url: string, body?: unknown) {
  const r = await http.put<ApiEnvelope<T>>(url, body ?? {});
  return r.data;
}
