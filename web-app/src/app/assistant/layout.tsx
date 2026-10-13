import type { Metadata } from 'next';
import { PortalShell } from '@/components/layout/portal-shell';

export const metadata: Metadata = { title: { absolute: 'Assistant portal | Care Elders India' }, robots: { index: false } };

export default function AssistantLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell role="ASSISTANT">{children}</PortalShell>;
}
