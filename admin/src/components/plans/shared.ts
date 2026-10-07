import { humanize } from '@/lib/utils';

export type Plan = {
  _id: string; planNumber: string; frequency: string; intervalDays?: number; startDate: string; timeOfDay: string; totalVisits: number; generatedCount: number;
  pricePerVisit: number; totalAmount: number; status: string; nextOccurrenceAt?: string; notes?: string; createdAt: string;
  serviceId?: { _id: string; name: string }; parentId?: { _id: string; fullName: string }; customerId?: { _id: string; name: string; email: string };
  cancellation?: { reason?: string; at?: string };
  endDate?: string; paymentId?: string; preferredAssistantId?: string; renewedFromId?: string; sheets?: { serviceId: string; itemKeys?: string[] }[]; timezone?: string;
};
export const PLAN_TONE: Record<string, 'ok' | 'warn' | 'neutral' | 'info'> = { ACTIVE: 'ok', PAUSED: 'warn', PENDING_PAYMENT: 'neutral', COMPLETED: 'info', CANCELLED: 'neutral' };
export const freqLabel = (p: Pick<Plan, 'frequency' | 'intervalDays'>) => (p.frequency === 'DAILY' ? 'Every day' : p.frequency === 'WEEKLY' ? 'Every week' : p.frequency === 'MONTHLY' ? 'Every month' : p.frequency === 'CUSTOM' ? `Every ${p.intervalDays} days` : p.frequency === 'BIWEEKLY' ? 'Every 2 weeks' : humanize(p.frequency));


export const FREQUENCIES = [
  { value: 'DAILY', label: 'Daily — visit every day' },
  { value: 'WEEKLY', label: 'Weekly — once a week' },
  { value: 'BIWEEKLY', label: 'Every 2 weeks' },
  { value: 'MONTHLY', label: 'Monthly — once a month' },
  { value: 'CUSTOM', label: 'Custom — every N days' },
];

/** Same cadence rules as the server: how many visits fit between start and end (inclusive). */
export function countVisits(start: string, end: string, freq: string, interval = 1) {
  if (!start || !end || end < start) return 0;
  const [y, m, d] = start.split('-').map(Number);
  let n = 0;
  for (; n < 400; n++) {
    let dt: Date;
    if (freq === 'MONTHLY') {
      const t = new Date(Date.UTC(y, m - 1 + n, 1));
      const dim = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
      dt = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, dim)));
    } else {
      const step = freq === 'DAILY' ? 1 : freq === 'WEEKLY' ? 7 : freq === 'BIWEEKLY' ? 14 : Math.max(1, interval);
      dt = new Date(Date.UTC(y, m - 1, d + step * n));
    }
    if (dt.toISOString().slice(0, 10) > end) break;
  }
  return n;
}
export const addDays = (iso: string, days: number) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10); };
export const PAY_METHODS = ['UPI', 'CASH', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'RAZORPAY', 'OTHER'];
