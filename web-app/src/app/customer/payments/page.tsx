'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPaged } from '@/lib/api';
import { PageHeader, Panel, Empty, ErrorState, Skeleton, Pagination } from '@/components/ui/misc';
import { PaymentBadge } from '@/components/ui/status';
import { dateTime, inr } from '@/lib/utils';

type Pay = { _id: string; receiptNumber?: string; amount: number; status: string; method?: string; createdAt: string };

export default function PaymentsPage() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['customer', 'payments', page], queryFn: () => getPaged<Pay>(`/customer/payments?page=${page}&limit=15`) });
  return (
    <div className="space-y-5">
      <PageHeader title="Payments" subtitle="Your payment history." />
      {q.isLoading ? <Skeleton className="h-48 w-full" /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : (
        <Panel bodyClass="p-0 divide-y divide-line">
          {q.data?.items.length ? q.data.items.map((p) => (
            <div key={p._id} className="flex items-center justify-between gap-3 px-5 py-4">
              <div><p className="font-semibold">{inr(p.amount)}</p><p className="text-sm text-ink-muted">{p.receiptNumber} · {dateTime(p.createdAt)}{p.method ? ` · ${p.method}` : ''}</p></div>
              <PaymentBadge status={p.status} />
            </div>
          )) : <Empty title="No payments yet" />}
        </Panel>
      )}
      <Pagination meta={q.data?.meta} onPage={setPage} />
    </div>
  );
}
