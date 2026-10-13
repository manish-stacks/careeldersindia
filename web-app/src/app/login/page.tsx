import type { Metadata } from 'next';
import Link from 'next/link';
import { Users, UserRoundCheck, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/layout/logo';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

const CARDS = [
  { href: '/customer/login', icon: Users, title: 'Customer', body: 'Family members who book visits for their parents.' },
  { href: '/assistant/login', icon: UserRoundCheck, title: 'Assistant', body: 'Care assistants who do the home visits.' },
  { href: '/admin/login', icon: ShieldCheck, title: 'Staff', body: 'Admin and care desk team.' },
];

export default function LoginChooser() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-canvas px-4 py-10">
      <Link href="/" aria-label="Back to website"><Logo subtitle="Care for your parents, from anywhere" /></Link>
      <h1 className="mt-10 text-3xl font-bold">Sign in as</h1>
      <div className="mt-8 grid w-full max-w-3xl gap-4 sm:grid-cols-3">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="rounded-xl border border-line bg-white p-6 text-center hover:border-brand">
            <c.icon className="mx-auto h-8 w-8 text-brand" />
            <p className="mt-3 text-lg font-semibold">{c.title}</p>
            <p className="mt-1 text-sm text-ink-muted">{c.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
