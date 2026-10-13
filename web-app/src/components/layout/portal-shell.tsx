'use client';
import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, CalendarClock, Users, CreditCard, FileHeart, UserRound, ClipboardList, IndianRupee, LogOut, PlusCircle, type LucideIcon } from 'lucide-react';
import { useAuth, homeFor } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Logo } from './logo';

type Nav = { href: string; label: string; icon: LucideIcon; exact?: boolean };
const NAVS: Record<'CUSTOMER' | 'ASSISTANT', Nav[]> = {
  CUSTOMER: [
    { href: '/customer', label: 'Home', icon: Home, exact: true },
    { href: '/customer/book', label: 'Book a visit', icon: PlusCircle },
    { href: '/customer/bookings', label: 'Visits', icon: CalendarClock },
    { href: '/customer/parents', label: 'My parents', icon: Users },
    { href: '/customer/reports', label: 'Reports', icon: FileHeart },
    { href: '/customer/payments', label: 'Payments', icon: CreditCard },
    { href: '/customer/profile', label: 'Account', icon: UserRound },
  ],
  ASSISTANT: [
    { href: '/assistant', label: 'Today', icon: Home, exact: true },
    { href: '/assistant/jobs', label: 'My jobs', icon: ClipboardList },
    { href: '/assistant/earnings', label: 'Earnings', icon: IndianRupee },
    { href: '/assistant/profile', label: 'Account', icon: UserRound },
  ],
};

/** Shared layout for the customer and assistant areas. Redirects anyone who should not be here. */
export function PortalShell({ role, children }: { role: 'CUSTOMER' | 'ASSISTANT'; children: ReactNode }) {
  const { user, ready, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isLogin = pathname === `/${role.toLowerCase()}/login`;

  useEffect(() => {
    if (!ready || isLogin) return;
    if (!user) router.replace(`/${role.toLowerCase()}/login?next=${encodeURIComponent(pathname)}`);
    else if (user.role !== role) router.replace(homeFor(user.role));
  }, [ready, user, role, router, pathname, isLogin]);

  if (isLogin) return <>{children}</>;
  if (!ready || !user || user.role !== role) {
    return <div className="flex min-h-screen items-center justify-center"><Logo /></div>;
  }

  const items = NAVS[role];
  const active = (n: Nav) => (n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(`${n.href}/`));
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Care Elders India website"><Logo subtitle={role === 'CUSTOMER' ? 'Family portal' : 'Assistant portal'} /></Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-ink-muted sm:block">{user.name}</span>
            <button onClick={() => logout()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-canvas"><LogOut className="h-4 w-4" />Sign out</button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6" aria-label="Main">
          {items.map((n) => (
            <Link key={n.href} href={n.href} className={cn('flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium', active(n) ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-canvas')}>
              <n.icon className="h-4 w-4" />{n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
