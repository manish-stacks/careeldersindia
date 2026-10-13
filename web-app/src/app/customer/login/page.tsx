import type { Metadata } from 'next';
import { RoleLogin } from '@/components/auth/role-login';

export const metadata: Metadata = { title: 'Customer sign in', robots: { index: false } };

export default function CustomerLogin() {
  return <RoleLogin role="CUSTOMER" title="Customer sign in" subtitle="See visits, reports and payments for your parents." side="Your parents are in India. You are never far from their care." others={[{ href: '/assistant/login', label: 'Assistant' }, { href: '/admin/login', label: 'Staff' }]} />;
}
