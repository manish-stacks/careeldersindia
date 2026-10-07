'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, CalendarClock, MapPinned, Siren, Users, HeartHandshake, UserRoundCheck, FileHeart, Repeat, Stethoscope, DollarSign, Bell, ScrollText, ShieldCheck, LogOut, Settings, Menu, X, Wifi, WifiOff, ChevronDown, Lock,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useSocket } from '@/lib/socket';
import { getPaged } from '@/lib/api';
import { permissionForPath } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import { Avatar } from '@/components/ui/misc';

type Item = { href: string; label: string; icon: typeof LayoutDashboard; perm: string; count?: number; urgent?: boolean };

export function Shell({ children }: { children: ReactNode }) {
  const { user, ready, logout, can } = useAuth();
  const { connected } = useSocket();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [ready, user, router, pathname]);
  useEffect(() => {
    setOpen(false);
    setMenu(false);
  }, [pathname]);
  useEffect(() => {
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // Only poll counts the person is allowed to see (otherwise every poll would 403)
  const verification = useQuery({ queryKey: ['bookings', 'count', 'verification'], queryFn: () => getPaged('/admin/bookings?queue=verification&limit=1'), enabled: !!user && can('bookings.view'), refetchInterval: 60_000 });
  const unassigned = useQuery({ queryKey: ['bookings', 'count', 'unassigned'], queryFn: () => getPaged('/admin/bookings?queue=unassigned&limit=1'), enabled: !!user && can('bookings.view'), refetchInterval: 60_000 });
  const alerts = useQuery({ queryKey: ['alerts', 'count'], queryFn: () => getPaged('/admin/emergency-alerts?status=OPEN&limit=1'), enabled: !!user && can('alerts.view'), refetchInterval: 30_000 });

  const bookingCount = (verification.data?.meta.total || 0) + (unassigned.data?.meta.total || 0);
  const groups: { label: string; items: Item[] }[] = [
    {
      label: 'Operations',
      items: [
        { href: '/dashboard', label: 'Today', icon: LayoutDashboard, perm: 'dashboard.view' },
        { href: '/bookings', label: 'Bookings', icon: CalendarClock, perm: 'bookings.view', count: bookingCount },
        { href: '/live-map', label: 'Live map', icon: MapPinned, perm: 'live_map.view' },
        { href: '/emergency-alerts', label: 'Alerts', icon: Siren, perm: 'alerts.view', count: alerts.data?.meta.total, urgent: true },
      ],
    },
    {
      label: 'People',
      items: [
        { href: '/customers', label: 'Customers', icon: Users, perm: 'customers.view' },
        { href: '/parents', label: 'Parents', icon: HeartHandshake, perm: 'customers.view' },
        { href: '/assistants', label: 'Assistants', icon: UserRoundCheck, perm: 'assistants.view' },
      ],
    },
    {
      label: 'Care',
      items: [
        { href: '/reports', label: 'Reports', icon: FileHeart, perm: 'reports.view' },
        { href: '/recurring-plans', label: 'Recurring plans', icon: Repeat, perm: 'plans.view' },
        { href: '/services', label: 'Services', icon: Stethoscope, perm: 'services.view' },
      ],
    },
    {
      label: 'Admin',
      items: [
        { href: '/payments', label: 'Payments', icon: DollarSign, perm: 'payments.view' },
        { href: '/notifications', label: 'Notifications', icon: Bell, perm: 'notifications.view' },
        { href: '/audit-logs', label: 'Audit log', icon: ScrollText, perm: 'audit.view' },
        { href: '/team', label: 'Team & roles', icon: ShieldCheck, perm: 'staff.view' },
      ],
    },
  ]
    .map((g) => ({ ...g, items: g.items.filter((i) => can(i.perm)) }))
    .filter((g) => g.items.length);

  const firstAllowed = groups[0]?.items[0]?.href;
  const needed = permissionForPath(pathname);
  const allowed = can(needed);

  // Landing page the person cannot open → send them to the first one they can
  useEffect(() => {
    if (ready && user && !allowed && pathname === '/dashboard' && firstAllowed) router.replace(firstAllowed);
  }, [ready, user, allowed, pathname, firstAllowed, router]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Logo />
      </div>
    );
  }

  const current = groups.flatMap((g) => g.items).find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)) || (pathname.startsWith('/settings') ? { label: 'Settings' } : undefined);
  const roleLabel = user.isSuper ? 'Super admin' : 'Team member';

  const nav = (
    <nav className="flex h-full flex-col" aria-label="Main">
      <div className="flex h-16 items-center border-b border-line px-5">
        <Logo />
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-4">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-medium transition-colors',
                        active ? 'bg-brand-soft text-brand-dark' : 'text-ink-soft hover:bg-canvas hover:text-ink'
                      )}
                    >
                      {active && <span className="absolute -left-3 bottom-1.5 top-1.5 w-1 rounded-r bg-brand" aria-hidden />}
                      <it.icon className="h-[18px] w-[18px]" />
                      <span className="flex-1">{it.label}</span>
                      {!!it.count && <span className={cn('min-w-[22px] rounded-full px-1.5 text-center text-xs font-semibold leading-5', it.urgent ? 'bg-danger text-white' : 'bg-ink text-white')}>{it.count}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-white lg:block">{nav}</aside>

      {/* Top header */}
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
        <button onClick={() => setOpen(true)} className="-ml-2 rounded-lg p-2 hover:bg-canvas lg:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{current?.label || 'Admin'}</p>
          <p className="hidden text-xs text-ink-muted sm:block">ParentCare admin</p>
        </div>

        <span className={cn('hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex', connected ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn')}>
          {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {connected ? 'Live' : 'Reconnecting…'}
        </span>

        {can('alerts.view') && (
          <Link href="/emergency-alerts" className="relative rounded-lg p-2 text-ink-soft hover:bg-canvas hover:text-ink" aria-label={`Alerts${alerts.data?.meta.total ? `, ${alerts.data.meta.total} open` : ''}`}>
            <Bell className="h-5 w-5" />
            {!!alerts.data?.meta.total && <span className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-danger px-1 text-center text-2xs font-semibold leading-[18px] text-white">{alerts.data.meta.total}</span>}
          </Link>
        )}

        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenu((v) => !v)} className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-canvas" aria-haspopup="menu" aria-expanded={menu}>
            <Avatar name={user.name} tone="brand" />
            <span className="hidden text-left sm:block">
              <span className="block max-w-[140px] truncate text-sm font-semibold leading-4">{user.name}</span>
              <span className="block text-xs text-ink-muted">{roleLabel}</span>
            </span>
            <ChevronDown className="h-4 w-4 text-ink-faint" />
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 mt-2 w-64 rounded-xl border border-line bg-white p-1.5 shadow-pop">
              <div className="border-b border-line px-3 pb-2 pt-1.5">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="truncate text-xs text-ink-muted">{user.email}</p>
              </div>
              <Link role="menuitem" href="/settings" className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-canvas hover:text-ink">
                <Settings className="h-4 w-4" />
                Settings &amp; password
              </Link>
              <button role="menuitem" onClick={logout} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-canvas hover:text-ink">
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-pop">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-lg p-2 hover:bg-canvas" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {nav}
          </aside>
        </div>
      )}

      <main className="mx-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {allowed ? (
          children
        ) : (
          <div className="mx-auto mt-16 max-w-md text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-canvas text-ink-faint"><Lock className="h-6 w-6" /></span>
            <h1 className="mt-4 text-xl font-bold">You don&apos;t have access to this page</h1>
            <p className="mt-1 text-ink-muted">Ask a super admin to add this permission to your role.</p>
            {firstAllowed && <Link href={firstAllowed} className="link mt-4 inline-block">Go to {groups[0].items[0].label}</Link>}
          </div>
        )}
      </main>
    </div>
  );
}
