'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { get } from '@/lib/api';
import { PageHeader, Panel, Empty, ErrorState, Skeleton } from '@/components/ui/misc';
import { VerificationBadge } from '@/components/ui/status';
import { JobRow, type Job } from '@/components/portal/job-row';
import { useAuth } from '@/lib/auth';

type Home = {
  profile?: { verificationStatus: string; isOnline?: boolean; isAvailable?: boolean; rating?: { average?: number; count?: number } };
  todays: Job[];
  counts: { today: number; completed: number; pending: number; awaitingAcceptance: number };
};

export default function AssistantHome() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['assistant', 'home'], queryFn: () => get<Home>('/assistant/home'), refetchInterval: 60_000 });
  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { profile, todays, counts } = q.data;
  const stats = [['Today', counts.today], ['Completed', counts.completed], ['Pending', counts.pending], ['Awaiting your reply', counts.awaitingAcceptance]] as const;
  return (
    <div className="space-y-6">
      <PageHeader title={`Hello, ${user?.name.split(' ')[0]}`} subtitle={profile ? <span className="inline-flex items-center gap-2">Verification: <VerificationBadge status={profile.verificationStatus} /></span> : undefined} />
      {profile && profile.verificationStatus !== 'VERIFIED' && (
        <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-sm text-ink-soft"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Your profile is not verified yet, so you will not receive jobs. Upload your documents in the mobile app or contact the care desk.</p>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map(([l, v]) => <div key={l} className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-ink-muted">{l}</p><p className="mt-1 text-3xl font-bold">{v}</p></div>)}
      </div>
      <Panel title="Today's visits" action={<Link href="/assistant/jobs" className="text-sm font-semibold text-brand">All jobs</Link>} bodyClass="p-0 divide-y divide-line">
        {todays.length ? todays.map((j) => <JobRow key={j._id} j={j} />) : <Empty title="No visits today" body="New jobs assigned to you will appear here." />}
      </Panel>
    </div>
  );
}
