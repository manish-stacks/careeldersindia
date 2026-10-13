import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const IST = 'Asia/Kolkata';

/** Paise → "₹1,299" (drops .00) */
export function inr(cents?: number | null) {
  if (cents === undefined || cents === null) return '—';
  const d = cents / 100;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: d % 1 ? 2 : 0 }).format(d);
}

/** All operational times are shown in India time. */
export function dateTime(d?: string | Date | null, opts: Intl.DateTimeFormatOptions = {}) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-US', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', ...opts }).format(new Date(d));
}
export const dateOnly = (d?: string | Date | null) => (d ? new Intl.DateTimeFormat('en-US', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d)) : '—');
export const timeOnly = (d?: string | Date | null) => (d ? new Intl.DateTimeFormat('en-US', { timeZone: IST, hour: 'numeric', minute: '2-digit' }).format(new Date(d)) : '—');

export function relative(d?: string | Date | null) {
  if (!d) return '—';
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

export const humanize = (s?: string | null) => (s ? s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '—');

export function age(dob?: string | null) {
  if (!dob) return undefined;
  const b = new Date(dob);
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a -= 1;
  return a;
}

export const initials = (name?: string) => (name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

export function toQuery(params: Record<string, unknown>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}
