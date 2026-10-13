import type { Metadata } from 'next';
import { RoleLogin } from '@/components/auth/role-login';

export const metadata: Metadata = { title: 'Staff sign in', robots: { index: false } };

export default function AdminLogin() {
  return <RoleLogin role="ADMIN" title="Sign in to the care desk" subtitle="For Care Elders India admin and staff. Access depends on your role." side="Verify carefully, assign thoughtfully. Every admin action is recorded." others={[{ href: '/customer/login', label: 'Customer' }, { href: '/assistant/login', label: 'Assistant' }]} />;
}
