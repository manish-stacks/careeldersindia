import type { Metadata } from 'next';
import { Shell } from '@/components/layout/shell';

export const metadata: Metadata = { title: { absolute: 'Care Elders India Admin' }, robots: { index: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
