'use client';
/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Menu, X, ChevronDown, Facebook, Instagram, Linkedin, Youtube } from 'lucide-react';
import { useAuth, homeFor } from '@/lib/auth';
import { get } from '@/lib/api';
import { Logo } from '@/components/layout/logo';
import { cn } from '@/lib/utils';
import { CATEGORIES, FALLBACK_PHONE } from './content';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About us' },
  { href: '/our-services', label: 'Services', menu: true },
  { href: '/contact', label: 'Contact' },
];
const LOGINS = [
  { href: '/customer/login', label: 'Customer' },
  { href: '/assistant/login', label: 'Assistant' },
  { href: '/admin/login', label: 'Staff' },
];
type Contact = { email?: string; phone?: string; whatsapp?: string; address?: string; facebook?: string; instagram?: string; linkedin?: string; youtube?: string };
const useContact = () => useQuery({ queryKey: ['public-contact'], queryFn: () => get<Contact>('/contact'), staleTime: 60_000, retry: 1 });

export function SiteHeader() {
  const { user, ready } = useAuth();
  const pathname = usePathname();
  const { data } = useContact();
  const [open, setOpen] = useState(false);
  const phone = data?.phone || data?.whatsapp || FALLBACK_PHONE;
  const signedIn = ready && user;
  const item = (active: boolean) => cn('inline-flex items-center gap-1 border-b-2 py-1 text-[16px] font-medium transition-colors', active ? 'border-leaf text-navy' : 'border-transparent text-ink-soft hover:text-navy');
  const drop = 'rounded-md border border-rule bg-white p-1.5 shadow-pop';
  const hover = 'invisible absolute top-full z-50 pt-2 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100';

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-white">
      <div className="hidden bg-navy-dark text-sm text-white/90 sm:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-1.5 sm:px-6">
          <span>Elder care at home and in care homes, across India</span>
          <span><a href={`tel:${phone.replace(/\s/g, '')}`} className="font-semibold hover:underline">Call {phone}</a></span>
        </div>
      </div>
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Care Elders India home"><Logo subtitle="Dignity · Care · Safety" /></Link>
        <nav className="hidden items-center gap-8 lg:flex" aria-label="Main">
          {NAV.map((n) => n.menu ? (
            <div key={n.href} className="group relative">
              <Link href={n.href} className={item(pathname === n.href)}>{n.label}<ChevronDown className="h-4 w-4" aria-hidden /></Link>
              <div className={`${hover} left-0 w-64`}>
                <div className={drop}>
                  {CATEGORIES.map((c) => <Link key={c.title} href="/our-services" className="block rounded px-3 py-2 text-[15px] hover:bg-sand">{c.title}</Link>)}
                </div>
              </div>
            </div>
          ) : <Link key={n.href} href={n.href} className={item(pathname === n.href)}>{n.label}</Link>)}
        </nav>
        <div className="hidden items-center gap-5 lg:flex">
                    {!signedIn && (
            <div className="group relative">
              <button type="button" className="inline-flex items-center gap-1 text-[16px] font-medium text-navy">Sign in <ChevronDown className="h-4 w-4" aria-hidden /></button>
              <div className={`${hover} right-0 w-48`}>
                <div className={drop}>
                  {LOGINS.map((l) => <Link key={l.href} href={l.href} className="block rounded px-3 py-2 text-[15px] hover:bg-sand">{l.label} login</Link>)}
                </div>
              </div>
            </div>
          )}
          {signedIn ? <Link href={homeFor(user.role)} className="btn-solid">My account</Link> : <Link href="/customer/login?next=/customer/book" className="btn-solid">Book a visit</Link>}
        </div>
        <button className="rounded-md p-2 hover:bg-sand lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu" aria-expanded={open}>{open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}</button>
      </div>
      {open && (
        <nav className="border-t border-rule bg-white px-4 pb-6 pt-2 lg:hidden" aria-label="Mobile">
          {NAV.map((n) => <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={cn('block border-b border-rule py-3 text-lg font-medium', pathname === n.href ? 'text-navy' : 'text-ink-soft')}>{n.label}</Link>)}
          <div className="mt-4 grid gap-2.5">
            <a href={`tel:${phone.replace(/\s/g, '')}`} className="btn-line">Call {phone}</a>
            {signedIn ? <Link href={homeFor(user.role)} onClick={() => setOpen(false)} className="btn-solid">My account</Link> : (
              <>
                <Link href="/customer/login?next=/customer/book" onClick={() => setOpen(false)} className="btn-solid">Book a visit</Link>
                {LOGINS.map((l) => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="py-1.5 text-center font-medium text-navy">Sign in as {l.label.toLowerCase()}</Link>)}
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  const { data } = useContact();
  const phone = data?.phone || data?.whatsapp || FALLBACK_PHONE;
  const email = data?.email || 'info@careeldersindia.com';
  const h = 'text-base font-semibold text-white';
  const a = 'text-[15px] text-white/75 hover:text-white hover:underline';
  const social = [[Facebook, 'Facebook', data?.facebook], [Instagram, 'Instagram', data?.instagram], [Linkedin, 'LinkedIn', data?.linkedin], [Youtube, 'YouTube', data?.youtube]] as const;
  return (
    <footer className="bg-navy-dark text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1.2fr_1.4fr]">
        <div>
          <span className="inline-flex items-center gap-3"><img src="/logo-mark.png" alt="" className="h-11 w-auto rounded bg-white p-1" /><span className="display text-2xl">Care Elders India</span></span>
          <p className="mt-4 max-w-xs text-[15px] text-white/70">Care for your parents at home and in our care homes, and a written note after every visit.</p>
          <div className="mt-5 flex gap-4">{social.filter(([, , u]) => u).map(([I, n, u]) => <a key={n} href={u} target="_blank" rel="noreferrer" aria-label={n} className="text-white/70 hover:text-white"><I className="h-5 w-5" aria-hidden /></a>)}</div>
        </div>
        <div><p className={h}>Explore</p><ul className="mt-4 space-y-2.5">{NAV.map((n) => <li key={n.href}><Link href={n.href} className={a}>{n.label}</Link></li>)}</ul></div>
        <div><p className={h}>Services</p><ul className="mt-4 space-y-2.5">{CATEGORIES.map((c) => <li key={c.title}><Link href="/our-services" className={a}>{c.title}</Link></li>)}</ul></div>
        <div>
          <p className={h}>Care desk</p>
          <ul className="mt-4 space-y-2.5 text-[15px] text-white/75">
            <li><a href={`tel:${phone.replace(/\s/g, '')}`} className={a}>{phone}</a></li>
            <li><a href={`mailto:${email}`} className={a}>{email}</a></li>
            <li>{data?.address || 'New Delhi, India'}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-5 text-sm text-white/55">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 sm:px-6">
          <p>© {new Date().getFullYear()} Care Elders India. Reports are not a medical diagnosis. In an emergency, call your local emergency number.</p>
          <p><Link href="/privacy-policy" className="hover:text-white hover:underline">Privacy policy</Link> · <Link href="/terms" className="hover:text-white hover:underline">Terms and conditions</Link></p>
        </div>
      </div>
    </footer>
  );
}
