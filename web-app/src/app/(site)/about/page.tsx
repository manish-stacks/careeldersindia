/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import { FileCheck2, GraduationCap, Eye, HeartHandshake, ShieldCheck, Users, Clock, BadgeCheck, ClipboardCheck, ArrowRight } from 'lucide-react';
import { IMG } from '@/components/site/images';
import { PageHero, CtaBand, SectionTitle, Faq } from '@/components/site/bits';

export const metadata: Metadata = { title: 'About us', description: 'Care Elders India helps families abroad look after their parents at home in India.' };

const NUMBERS = [
  { icon: Users, value: '500+', label: 'Happy Families' },
  { icon: BadgeCheck, value: '200+', label: 'Trained Caregivers' },
  { icon: ShieldCheck, value: '98%', label: 'Client Satisfaction' },
  { icon: Clock, value: '24/7', label: 'Care Desk Support' },
];
const VALUES = [
  { icon: HeartHandshake, title: 'Dignity first', body: 'Every elder is treated with respect, patience and kindness.' },
  { icon: Eye, title: 'Full transparency', body: 'Families see who visits, when, and what was recorded.' },
  { icon: ShieldCheck, title: 'Safety always', body: 'Urgent concerns reach the care desk and the family immediately.' },
  { icon: ClipboardCheck, title: 'Honest reports', body: 'We record measurements and observations. We never diagnose.' },
];
const VERIFY = [
  { icon: FileCheck2, title: 'Documents checked', body: 'Identity and qualification documents are reviewed by our care desk.' },
  { icon: GraduationCap, title: 'Trained for home visits', body: 'Assistants follow a fixed checklist for vitals, medicines and wellbeing.' },
  { icon: Eye, title: 'Supervised', body: 'Every booking, assignment and report is visible to our care desk and recorded.' },
];
const FAQ: [string, string][] = [
  ['Who visits my parents?', 'A verified and trained care assistant, assigned and supervised by our care desk. You see the name before the visit.'],
  ['How do I know the visit happened?', 'You can follow the assistant on the way, and you receive a visit report with measurements, notes and photos right after the visit.'],
  ['Is the report a medical diagnosis?', 'No. It is a record of measurements and observations. Please consult a doctor for medical advice.'],
  ['What if something is urgent?', 'The assistant marks it as urgent. The care desk and the family are alerted immediately.'],
];

export default function AboutPage() {
  return (
    <>
      <PageHero image={IMG.about} eyebrow="About us" title="Distance should not mean worry">Millions of families live far from their parents. We exist so that the people who raised you are seen, checked and cared for, and so that you always know.</PageHero>

      {/* Numbers */}
      <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
        <ul className="grid grid-cols-2 gap-4 rounded-3xl border border-[#D6E8E6] bg-white p-6 shadow-sm sm:p-8 lg:grid-cols-4">
          {NUMBERS.map((n) => (
            <li key={n.label} className="text-center">
              <n.icon className="mx-auto h-9 w-9 text-[#1E8F7E]" aria-hidden />
              <p className="display mt-2 text-3xl font-bold text-[#0B3A53]">{n.value}</p>
              <p className="mt-1 text-[15px] font-medium text-ink-soft">{n.label}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Story */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <img src={IMG.aboutPhoto} alt="A granddaughter hugging her grandmother" loading="lazy" className="h-72 w-full rounded-3xl object-cover shadow-xl ring-4 ring-white sm:h-96" />
        <div>
          <SectionTitle tag="Our story" title="What we believe" />
          <div className="mt-5 space-y-4 text-lg leading-relaxed text-ink-soft">
            <p>Good care starts with paying attention. A regular visit by someone trained to notice small changes can catch a problem early and give a family real reassurance.</p>
            <p>We built Care Elders India around that idea. Families book, trained assistants visit, and a care desk watches over every step. The result is a report you can trust and a team you can reach.</p>
          </div>
          <Link href="/contact" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#0B4F6C] px-7 py-3.5 text-lg font-semibold text-white hover:bg-[#093E55]">Talk to our care desk <ArrowRight className="h-5 w-5" aria-hidden /></Link>
        </div>
      </section>

      {/* Values */}
      <section className="bg-gradient-to-r from-[#DDF0ED] to-[#EAF6F4]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <SectionTitle tag="Our values" title="What guides every visit" />
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map((v) => (
              <div key={v.title} className="rounded-2xl bg-white p-6 shadow-sm">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1E8F7E] text-white"><v.icon className="h-6 w-6" aria-hidden /></span>
                <h3 className="mt-4 text-lg font-bold text-[#0B3A53]">{v.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Assistants */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <SectionTitle tag="Our team" title="How we choose our assistants" />
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {VERIFY.map((v, i) => (
            <li key={v.title} className="relative rounded-3xl border border-[#D6E8E6] bg-white p-8">
              <span className="display absolute right-6 top-4 text-5xl font-bold text-[#DDF0ED]" aria-hidden>{i + 1}</span>
              <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#E4F2F0] text-brand"><v.icon className="h-6 w-6" aria-hidden /></span>
              <h3 className="mt-5 text-xl font-bold text-[#0B3A53]">{v.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-soft">{v.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 pb-8 sm:px-6">
        <SectionTitle tag="Questions" title="Things families ask us" />
        <div className="mt-8"><Faq items={FAQ} /></div>
      </section>

      <CtaBand />
    </>
  );
}
