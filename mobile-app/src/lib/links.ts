import * as WebBrowser from 'expo-web-browser';
import type { Role } from './types';

/**
 * Screen registry for notification taps and deep links.
 * Keys match backend APP_SCREENS (src/config/constants.js) — admins pick from the same list.
 */
type Maker = (id?: string) => string;
const SCREENS: Record<string, { roles: Role[]; href: Maker; needsId?: boolean }> = {
  home: { roles: ['CUSTOMER'], href: () => '/home' },
  visits: { roles: ['CUSTOMER'], href: () => '/visits' },
  book: { roles: ['CUSTOMER'], href: () => '/book' },
  parents: { roles: ['CUSTOMER'], href: () => '/parents' },
  reports: { roles: ['CUSTOMER'], href: () => '/reports' },
  plans: { roles: ['CUSTOMER'], href: () => '/plans' },
  payments: { roles: ['CUSTOMER'], href: () => '/payments' },
  account: { roles: ['CUSTOMER'], href: () => '/account' },
  booking: { roles: ['CUSTOMER'], href: (id) => `/booking/${id}`, needsId: true },
  report: { roles: ['CUSTOMER'], href: (id) => `/report/${id}`, needsId: true },
  parent: { roles: ['CUSTOMER'], href: (id) => `/parent/${id}`, needsId: true },
  plan: { roles: ['CUSTOMER'], href: (id) => `/plan/${id}`, needsId: true },
  today: { roles: ['ASSISTANT'], href: () => '/today' },
  jobs: { roles: ['ASSISTANT'], href: () => '/jobs' },
  new_jobs: { roles: ['ASSISTANT'], href: () => '/jobs?scope=new' },
  earnings: { roles: ['ASSISTANT'], href: () => '/earnings' },
  documents: { roles: ['ASSISTANT'], href: () => '/documents' },
  availability: { roles: ['ASSISTANT'], href: () => '/availability' },
  profile: { roles: ['ASSISTANT'], href: () => '/me' },
  job: { roles: ['ASSISTANT'], href: (id) => `/job/${id}`, needsId: true },
  notifications: { roles: ['CUSTOMER', 'ASSISTANT'], href: () => '/notifications' },
  sos: { roles: ['CUSTOMER', 'ASSISTANT'], href: () => '/sos' },
};

const ID = /^[a-f\d]{24}$/i;
export const LINK_HOST = process.env.EXPO_PUBLIC_APP_LINK_HOST || 'parentcare.in';

/** Screen key + optional id → in-app path for this role, or null when the role can't open it. */
export function screenHref(screen: string | undefined, id: string | undefined, role?: Role) {
  const s = screen ? SCREENS[screen] : undefined;
  if (!s || (role && !s.roles.includes(role))) return null;
  if (s.needsId && !(id && ID.test(id))) return null;
  return s.href(id);
}

/**
 * Turns any incoming link into an app path.
 *  parentcare://booking/<id>          → /booking/<id>
 *  https://parentcare.in/app/job/<id> → /job/<id>
 *  …/app/s/<screen>[/<id>]            → /open?screen=…&id=…  (resolved per role after sign-in)
 *  …/app/b/<id> | j/<id> | r/<id>     → short links for SMS/WhatsApp
 */
export function pathFromUrl(raw: string): string | null {
  try {
    let path = raw;
    if (/^parentcare:\/\//i.test(raw)) path = '/' + raw.replace(/^parentcare:\/\/\/?/i, '');
    else if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      if (u.hostname !== LINK_HOST && u.hostname !== `www.${LINK_HOST}`) return null;
      path = u.pathname.replace(/^\/app/, '') + u.search;
    }
    if (!path.startsWith('/')) path = '/' + path;
    const [p, query = ''] = path.split('?');
    const seg = p.split('/').filter(Boolean);
    const short: Record<string, string> = { b: 'booking', j: 'job', r: 'report', p: 'plan' };
    if (seg[0] === 's' && seg[1]) return `/open?screen=${encodeURIComponent(seg[1])}${seg[2] ? `&id=${encodeURIComponent(seg[2])}` : ''}`;
    if (short[seg[0]] && seg[1]) return `/${short[seg[0]]}/${seg[1]}`;
    return (p || '/') + (query ? `?${query}` : '');
  } catch {
    return null;
  }
}

export type Target = { href: string } | { external: string } | null;

/** What a tapped notification should open — same logic for push taps and the in-app inbox. */
export function notificationTarget(data: Record<string, unknown> | undefined, role?: Role): Target {
  if (!data) return { href: '/notifications' };
  const str = (k: string) => (typeof data[k] === 'string' ? (data[k] as string) : undefined);
  const url = str('url');
  if (url) {
    const inApp = pathFromUrl(url);
    return inApp ? { href: inApp } : /^https:\/\//.test(url) ? { external: url } : { href: '/notifications' };
  }
  const screen = str('screen');
  if (screen) {
    const key = SCREENS[screen]?.needsId ? { booking: 'bookingId', job: 'bookingId', report: 'reportId', parent: 'parentId', plan: 'planId' }[screen] : undefined;
    const href = screenHref(screen, key ? str(key) : undefined, role);
    if (href) return { href };
  }
  // system notifications carry record ids
  if (str('reportId') && role === 'CUSTOMER') return { href: `/report/${str('reportId')}` };
  if (str('bookingId')) return { href: role === 'ASSISTANT' ? `/job/${str('bookingId')}` : `/booking/${str('bookingId')}` };
  if (str('planId') && role === 'CUSTOMER') return { href: `/plan/${str('planId')}` };
  return { href: '/notifications' };
}

export async function openExternal(url: string) {
  await WebBrowser.openBrowserAsync(url).catch(() => {});
}

// ---- links that arrive while signed out: remember and replay after sign-in
let pending: string | null = null;
const PUBLIC = ['/login', '/register', '/register-assistant', '/forgot', '/'];
export function rememberPending(path: string) {
  if (path && !PUBLIC.includes(path.split('?')[0])) pending = path;
}
export function takePending() {
  const p = pending;
  pending = null;
  return p;
}
