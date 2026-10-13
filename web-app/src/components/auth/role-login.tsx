'use client';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth, homeFor } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Logo } from '@/components/layout/logo';

type Role = 'CUSTOMER' | 'ASSISTANT' | 'ADMIN';
type Props = { role: Role; title: string; subtitle: string; side: string; others: { href: string; label: string }[] };

function Form({ role }: { role: Role }) {
  const { login, user, ready } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(params.get('expired') ? 'Your session ended. Please sign in again.' : null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next');
  const home = homeFor(role);
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') && (role === 'ADMIN' ? !/^\/(customer|assistant)/.test(next) : next.startsWith(home)) ? next : home;

  useEffect(() => {
    if (ready && user) router.replace(user.role === role ? safeNext : homeFor(user.role));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(identifier.trim(), password, role);
      router.replace(safeNext);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Email or mobile" htmlFor="identifier"><Input id="identifier" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required /></Field>
      <Field label="Password" htmlFor="password">
        <div className="relative">
          <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-11" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1 top-1 rounded-md p-2 text-ink-muted hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
        </div>
      </Field>
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" size="lg" className="w-full justify-center" loading={busy} disabled={!identifier || !password}>Sign in</Button>
    </form>
  );
}

export function RoleLogin({ role, title, subtitle, side, others }: Props) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col justify-between bg-white px-6 py-8 sm:px-12">
        <Link href="/" aria-label="Back to website"><Logo subtitle="Care for your parents, from anywhere" /></Link>
        <div className="mx-auto w-full max-w-sm py-12">
          <h1 className="text-[28px] font-bold leading-9">{title}</h1>
          <p className="mt-2 text-ink-muted">{subtitle}</p>
          <div className="mt-8"><Suspense><Form role={role} /></Suspense></div>
          {role !== 'ADMIN' && <p className="mt-4 text-center text-sm text-ink-muted">No account yet? <Link href="/contact" className="font-semibold text-brand hover:underline">Contact our care desk</Link>.</p>}
        </div>
        <p className="text-sm text-ink-muted">Other sign in: {others.map((o, i) => <span key={o.href}>{i > 0 && ' · '}<Link href={o.href} className="font-semibold text-brand hover:underline">{o.label}</Link></span>)}</p>
      </div>
      <div className="relative hidden overflow-hidden bg-brand lg:block">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
          {Array.from({ length: 14 }).map((_, i) => <path key={i} d={`M -40 ${120 + i * 48} C 160 ${60 + i * 48}, 300 ${220 + i * 48}, 640 ${100 + i * 48}`} fill="none" stroke="#fff" strokeOpacity={0.07 + (i % 4) * 0.03} strokeWidth="1.5" />)}
        </svg>
        <div className="relative flex h-full flex-col justify-end p-14 text-white"><p className="max-w-md text-[32px] font-semibold leading-[1.2]">{side}</p></div>
      </div>
    </div>
  );
}
