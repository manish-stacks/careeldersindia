import type { Metadata } from 'next';
import { RoleLogin } from '@/components/auth/role-login';

export const metadata: Metadata = { title: 'Assistant sign in', robots: { index: false } };

export default function AssistantLogin() {
  return <RoleLogin role="ASSISTANT" title="Assistant sign in" subtitle="Manage your jobs and visits." side="Every visit is someone's mother or father. Care for them as your own." others={[{ href: '/customer/login', label: 'Customer' }, { href: '/admin/login', label: 'Staff' }]} />;
}
