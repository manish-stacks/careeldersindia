'use client';
/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Menu, X, ChevronDown, Mail, MapPin, Phone, Facebook, Instagram, Linkedin, Youtube } from 'lucide-react';
import { useAuth, homeFor } from '@/lib/auth';
import { get } from '@/lib/api';
import { Logo } from '@/components/layout/logo';
import { cn } from '@/lib/utils';
import { CATEGORIES, FALLBACK_PHONE } from './content';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About Us' },
  { href: '/our-services', label: 'Our Services', menu: true },
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
  const item = (active: boolean) => cn('inline-flex items-center gap-1 border-b-2 px-1 py-2 text-[16px] font-semibold transition-colors', active ? 'border-[#1E8F7E] text-[#0B3A53]' : 'border-transparent text-ink-soft hover:text-[#1E8F7E]');
  const btn = 'inline-flex items-center rounded-full bg-[#0B4F6C] px-6 py-3 text-[16px] font-semibold text-white shadow-md hover:bg-[#093E55]';

  return (
    <header className="sticky top-0 z-40 border-b border-[#E3EFEE] bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Care Elders India home"><Logo subtitle="DIGNITY • CARE • SAFETY" /></Link>
        <nav className="hidden items-center gap-5 xl:flex" aria-label="Main">
          {NAV.map((n) => n.menu ? (
            <div key={n.href} className="group relative">
              <Link href={n.href} className={item(pathname === n.href)}>{n.label}<ChevronDown className="h-4 w-4" aria-hidden /></Link>
              <div className="invisible absolute left-0 top-full z-50 w-72 pt-2 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <div className="rounded-2xl border border-[#E3EFEE] bg-white p-2 shadow-xl">
                  {CATEGORIES.map((c) => <Link key={c.title} href="/our-services" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium hover:bg-[#F3FAF9]"><c.icon className="h-5 w-5 text-[#1E8F7E]" aria-hidden />{c.title}</Link>)}
                </div>
              </div>
            </div>
          ) : <Link key={n.href} href={n.href} className={item(pathname === n.href)}>{n.label}</Link>)}
        </nav>
        <div className="hidden items-center gap-3 xl:flex">
          <a href={`tel:${phone.replace(/\s/g, '')}`} className="hidden items-center gap-2 rounded-full bg-[#DDF0ED] px-4 py-2.5 text-[15px] font-semibold text-[#0B3A53] 2xl:inline-flex"><Phone className="h-4 w-4 text-[#1E8F7E]" aria-hidden />{phone}</a>
          {!signedIn && (
            <div className="group relative">
              <button type="button" className="inline-flex items-center gap-1.5 rounded-full px-4 py-3 text-[16px] font-semibold text-[#0B4F6C] hover:bg-[#F3FAF9]">Sign in <ChevronDown className="h-4 w-4" aria-hidden /></button>
              <div className="invisible absolute right-0 top-full z-50 w-60 pt-2 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <div className="rounded-2xl border border-[#E3EFEE] bg-white p-2 shadow-xl">
                  {LOGINS.map((l) => <Link key={l.href} href={l.href} className="block rounded-xl px-4 py-2.5 text-[15px] font-semibold hover:bg-[#F3FAF9]">{l.label} login</Link>)}
                </div>
              </div>
            </div>
          )}
          {signedIn ? <Link href={homeFor(user.role)} className={btn}>My account</Link> : ''}
        </div>
        <button className="rounded-xl p-2.5 hover:bg-[#F3FAF9] xl:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu" aria-expanded={open}>{open ? <X className="h-7 w-7" /> : <Menu className="h-7 w-7" />}</button>
      </div>
      {open && (
        <nav className="border-t border-[#E3EFEE] bg-white px-4 pb-6 pt-3 xl:hidden" aria-label="Mobile">
          {NAV.map((n) => <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={cn('block rounded-xl px-3 py-3 text-lg font-semibold', pathname === n.href ? 'bg-[#DDF0ED] text-[#0B3A53]' : 'text-ink-soft')}>{n.label}</Link>)}
          <div className="mt-3 grid gap-2.5 border-t border-[#E3EFEE] pt-4">
            <a href={`tel:${phone.replace(/\s/g, '')}`} className="rounded-full bg-[#DDF0ED] px-4 py-3 text-center font-semibold text-[#0B3A53]">Call {phone}</a>
            {signedIn ? <Link href={homeFor(user.role)} onClick={() => setOpen(false)} className="rounded-full bg-[#0B4F6C] px-4 py-3.5 text-center font-semibold text-white">My account</Link> : (
              <>
                <Link href="/customer/login?next=/customer/book" onClick={() => setOpen(false)} className="rounded-full bg-[#0B4F6C] px-4 py-3.5 text-center font-semibold text-white">Book a Service</Link>
                {LOGINS.map((l) => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-full border border-[#D6E8E6] px-4 py-3 text-center font-semibold text-[#0B3A53]">Sign in as {l.label.toLowerCase()}</Link>)}
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
  const h = 'text-base font-bold text-white';
  const a = 'text-[15px] text-white/75 hover:text-white hover:underline';
  const social = [[Facebook, 'Facebook', data?.facebook], [Instagram, 'Instagram', data?.instagram], [Linkedin, 'LinkedIn', data?.linkedin], [Youtube, 'YouTube', data?.youtube]] as const;
  return (
    <footer className="bg-gradient-to-br from-[#0B3A53] to-[#0A4F5E] text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1.3fr_1.3fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-3"><img src="/logo-mark.png" alt="" className="h-12 w-auto rounded-xl bg-white p-1.5" /><span className="display text-2xl font-bold">Care Elders India</span></span>
          <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-white/75">Compassionate, professional elder care at home and in our care homes, for families across India.</p>
        </div>
        <div><p className={h}>Quick Links</p><ul className="mt-4 space-y-2.5">{NAV.map((n) => <li key={n.href}><Link href={n.href} className={a}>{n.label}</Link></li>)}</ul></div>
        <div><p className={h}>Our Services</p><ul className="mt-4 space-y-2.5">{CATEGORIES.map((c) => <li key={c.title}><Link href="/our-services" className={a}>{c.title}</Link></li>)}</ul></div>
        <div>
          <p className={h}>Contact Us</p>
          <ul className="mt-4 space-y-3 text-[15px] text-white/80">
            <li className="flex items-start gap-3"><Phone className="mt-1 h-4 w-4 shrink-0" aria-hidden /><a href={`tel:${phone.replace(/\s/g, '')}`} className={a}>{phone}</a></li>
            <li className="flex items-start gap-3"><Mail className="mt-1 h-4 w-4 shrink-0" aria-hidden /><a href={`mailto:${email}`} className={a}>{email}</a></li>
            <li className="flex items-start gap-3"><MapPin className="mt-1 h-4 w-4 shrink-0" aria-hidden />{data?.address || 'New Delhi, India'}</li>
          </ul>
        </div>
        <div>
          <p className={h}>Follow Us</p>
          <div className="mt-4 flex gap-3">{social.map(([I, n, u]) => <a key={n} href={u || '#'} {...(u ? { target: '_blank', rel: 'noreferrer' } : {})} aria-label={n} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#0B3A53] hover:bg-[#DDF0ED]"><I className="h-5 w-5" aria-hidden /></a>)}</div>
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-5 text-sm text-white/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 sm:px-6">
          <p>© {new Date().getFullYear()} Care Elders India. All rights reserved. Reports are not a medical diagnosis. In an emergency, call your local emergency number.</p>
          <p><Link href="/privacy-policy" className="hover:text-white hover:underline">Privacy Policy</Link> &nbsp;|&nbsp; <Link href="/terms" className="hover:text-white hover:underline">Terms &amp; Conditions</Link></p>
        </div>
      </div>
    </footer>
  );
}
