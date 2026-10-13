'use client';
import { FileBarChart } from 'lucide-react';
import { http } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Button } from '@/components/ui/button';

/** Overall report for a customer: all completed visits (optionally one parent and a date range) with tests side by side. */
export function SummaryButton({ customerId, parentId, from, to }: { customerId: string; parentId?: string; from?: string; to?: string }) {
  const open = useAction(async () => {
    const r = await http.get(`/admin/customers/${customerId}/summary-pdf`, { params: { parentId: parentId || undefined, from: from || undefined, to: to || undefined }, responseType: 'blob' });
    window.open(URL.createObjectURL(r.data), '_blank', 'noopener');
  });
  return <Button size="sm" variant="secondary" onClick={() => open.mutate(undefined)} loading={open.isPending}><FileBarChart className="h-4 w-4" />Overall report</Button>;
}
