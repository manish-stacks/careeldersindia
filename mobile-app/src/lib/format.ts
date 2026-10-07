const IST = 'Asia/Kolkata';
export const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || IST;

/** Amounts are stored in paise (INR). */
export function usd(cents?: number | null) {
  if (cents === undefined || cents === null) return '—';
  const d = cents / 100;
  return '₹' + d.toLocaleString('en-IN', { minimumFractionDigits: d % 1 ? 2 : 0, maximumFractionDigits: 2 });
}
export const inr = usd; // legacy alias — existing screens keep working

const fmt = (d: string | Date, o: Intl.DateTimeFormatOptions, tz = IST) => new Intl.DateTimeFormat('en-US', { timeZone: tz, ...o }).format(new Date(d));
export const dateLong = (d?: string | Date | null, tz = IST) => (d ? fmt(d, { weekday: 'short', day: 'numeric', month: 'short' }, tz) : '—');
export const dateFull = (d?: string | Date | null, tz = IST) => (d ? fmt(d, { day: 'numeric', month: 'short', year: 'numeric' }, tz) : '—');
export const time = (d?: string | Date | null, tz = IST) => (d ? fmt(d, { hour: 'numeric', minute: '2-digit' }, tz) : '—');
export const dateTime = (d?: string | Date | null, tz = IST) => (d ? `${dateLong(d, tz)}, ${time(d, tz)}` : '—');

/** "Sat 12 Oct, 10:00 am IST" plus the viewer's own time when they're abroad. */
export function visitTime(d: string, viewerTz = deviceTz()) {
  const ist = `${dateLong(d)}, ${time(d)} IST`;
  if (viewerTz === IST || viewerTz === 'Asia/Calcutta') return { main: ist, local: undefined as string | undefined };
  const city = viewerTz.split('/').pop()?.replace(/_/g, ' ');
  return { main: ist, local: `${dateLong(d, viewerTz)}, ${time(d, viewerTz)} in ${city}` };
}

/** "in 5 minutes" / "2 days ago". Hand-rolled: Hermes (Android) has no Intl.RelativeTimeFormat. */
export function relative(d?: string | Date | null) {
  if (!d) return '—';
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const a = Math.abs(diff);
  if (a < 60) return 'just now';
  const [n, unit] = a < 3600 ? [Math.round(a / 60), 'minute'] : a < 86400 ? [Math.round(a / 3600), 'hour'] : [Math.round(a / 86400), 'day'];
  if (unit === 'day' && n === 1) return diff > 0 ? 'tomorrow' : 'yesterday';
  const text = `${n} ${unit}${n === 1 ? '' : 's'}`;
  return diff > 0 ? `in ${text}` : `${text} ago`;
}

export const humanize = (s?: string | null) => (s ? s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '—');
export const initials = (n?: string) => (n || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
export const firstName = (n?: string) => (n || '').split(' ')[0];

/** YYYY-MM-DD for a date in IST */
export function istDate(d: Date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(d);
}
export function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** IST wall-clock → UTC instant */
export const istToDate = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00+05:30`);
export const ymdLabel = (ymd: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${ymd}T00:00:00Z`));
export const hhmmLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
export function ageFrom(dob?: string) {
  if (!dob) return undefined;
  const b = new Date(dob);
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a -= 1;
  return a;
}