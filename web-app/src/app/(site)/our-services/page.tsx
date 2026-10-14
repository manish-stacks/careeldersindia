import type { Metadata } from 'next';
import Link from 'next/link';
import { ServiceGrid } from '@/components/site/services';
import { IMG } from '@/components/site/images';
import { PageHero, CtaBand } from '@/components/site/bits';

export const metadata: Metadata = { title: 'Services', description: 'Home health visits for elders in India: vitals checks, daily care, blood tests and written reports.' };
const INCLUDED = ['Verified, trained assistant', 'Vitals and symptom check', 'Medicine follow-up', 'Photos and notes when needed', 'Report in your account and as PDF', 'Emergency alert to our care desk'];

export default function ServicesPage() {
  return (
    <>
      <PageHero image={IMG.hands} eyebrow="Our services" title="Care at home, one visit at a time">Choose the visit that fits your parent. Every service below lists the tests and checks our assistant will do, and ends with a written report for you.</PageHero>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <ServiceGrid full />
        <div className="mt-16 grid gap-8 rounded-md bg-sand p-8 sm:p-12 lg:grid-cols-[1fr_1.4fr]">
          <h2 className="display text-2xl text-navy sm:text-3xl">On every visit</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {INCLUDED.map((t) => <li key={t} className="border-t border-rule pt-2">{t}</li>)}
          </ul>
        </div>
        <p className="mt-10 text-center text-lg text-ink-muted">Looking for something else? <Link href="/contact" className="font-semibold text-navy underline">Tell us what your parent needs</Link>.</p>
      </div>
      <CtaBand />
    </>
  );
}
