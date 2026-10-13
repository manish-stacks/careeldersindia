'use client';
import { PageHeader } from '@/components/ui/misc';
import { AccountSettings } from '@/components/portal/account-settings';

export default function CustomerProfile() {
  return (
    <div className="space-y-5">
      <PageHeader title="Account" subtitle="Your details and password." />
      <AccountSettings />
    </div>
  );
}
