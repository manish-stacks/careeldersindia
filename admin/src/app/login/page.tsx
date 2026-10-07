'use client';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Logo } from '@/components/layout/logo';

function LoginForm() {
  const { login, user, ready } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(params.get('expired') ? 'Your session ended. Please sign in again.' : null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next') || '/dashboard';

  useEffect(() => {
    if (ready && user) router.replace(next.startsWith('/') ? next : '/dashboard');
  }, [ready, user, router, next]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(identifier.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Email or mobile" htmlFor="identifier">
        <Input id="identifier" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
      </Field>
      <Field label="Password" htmlFor="password">
        <div className="relative">
          <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-11" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1 top-1 rounded-md p-2 text-ink-muted hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full justify-center" loading={busy} disabled={!identifier || !password}>
        Sign in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col justify-between bg-white px-6 py-8 sm:px-12">
        <Logo />
        <div className="mx-auto w-full max-w-sm py-12">
          <h1 className="text-[28px] font-bold leading-9">Sign in to the care desk</h1>
          <p className="mt-2 text-ink-muted">For ParentCare operations staff only.</p>
          <div className="mt-8">
            <Suspense>
              <LoginForm />
            </Suspense>
          </div>
        </div>
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <ShieldCheck className="h-4 w-4" /> Every admin action is recorded in the audit log.
        </p>
      </div>
      <div className="relative hidden overflow-hidden bg-brand lg:block">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
          {Array.from({ length: 14 }).map((_, i) => (
            <path key={i} d={`M -40 ${120 + i * 48} C 160 ${60 + i * 48}, 300 ${220 + i * 48}, 640 ${100 + i * 48}`} fill="none" stroke="#fff" strokeOpacity={0.07 + (i % 4) * 0.03} strokeWidth="1.5" />
          ))}
        </svg>
        <div className="relative flex h-full flex-col justify-end p-14 text-white">
          <p className="max-w-md text-[32px] font-semibold leading-[1.2]">Every visit is someone&apos;s mother or father. Verify carefully, assign thoughtfully.</p>
          <p className="mt-4 max-w-md text-white/80">Families abroad rely on this desk to know their parents are seen, checked and cared for at home.</p>
        </div>
      </div>
    </div>
  );
}
