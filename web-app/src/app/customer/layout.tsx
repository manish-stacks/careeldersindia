import type { Metadata } from 'next';
import { PortalShell } from '@/components/layout/portal-shell';

export const metadata: Metadata = { title: { absolute: 'Family portal | Care Elders India' }, robots: { index: false } };

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell role="CUSTOMER">{children}</PortalShell>;
}
