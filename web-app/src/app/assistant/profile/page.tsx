'use client';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { PageHeader, Panel, KeyVal } from '@/components/ui/misc';
import { VerificationBadge } from '@/components/ui/status';
import { AccountSettings } from '@/components/portal/account-settings';

type Profile = { profile: { verificationStatus: string; qualification?: string; experienceYears?: number; languages?: string[]; serviceAreas?: { city: string }[] } };

export default function AssistantProfile() {
  const q = useQuery({ queryKey: ['assistant', 'profile'], queryFn: () => get<Profile>('/assistant/profile') });
  const p = q.data?.profile;
  return (
    <div className="space-y-5">
      <PageHeader title="Account" subtitle="Your professional details and password." />
      {p && (
        <Panel title="Professional details">
          <KeyVal items={[
            ['Verification', <VerificationBadge key="v" status={p.verificationStatus} />],
            ['Qualification', p.qualification || '—'],
            ['Experience', `${p.experienceYears ?? 0} years`],
            ['Languages', p.languages?.join(', ') || '—'],
            ['Service areas', p.serviceAreas?.map((s) => s.city).join(', ') || '—'],
          ]} />
          <p className="mt-4 text-sm text-ink-muted">To change documents or service areas, use the mobile app or contact the care desk.</p>
        </Panel>
      )}
      <AccountSettings />
    </div>
  );
}
