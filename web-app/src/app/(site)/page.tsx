/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { Check, BadgeCheck, FileText, MapPin, BellRing } from 'lucide-react';
import { SectionTitle, CtaBand, Faq } from '@/components/site/bits';
import { CATEGORIES } from '@/components/site/content';
import { IMG } from '@/components/site/images';

const STEPS = [
  ['Write to us', 'Tell us where your parents live and what worries you. A person on our care desk reads it.'],
  ['Agree a plan', 'We suggest the right visit and fix a time that suits your parents.'],
  ['We visit', 'You get the assistant\'s name beforehand and can follow them on the map.'],
  ['You get a report', 'Measurements, notes and photos reach your account. If it is urgent, we call.'],
];
const REASONS = [
  'Every assistant is identity-checked and trained before the first visit.',
  'You can see who visited, when, and what was recorded.',
  'Reports list measurements and observations. We never give a diagnosis.',
  'An urgent concern reaches our care desk and your family straight away.',
];

const TRUST = [
  [BadgeCheck, 'Verified assistants', 'Identity and qualifications checked'],
  [FileText, 'Report after every visit', 'In your account and as a PDF'],
  [MapPin, 'Follow them on the way', 'Know when they will arrive'],
  [BellRing, 'Urgent alerts', 'Our care desk and you, at once'],
] as const;
const WHO = [
  ['Families living abroad', 'You are in another country and cannot just drop in. We visit, and you read what we found the same evening.'],
  ['Families in the same city', 'You are busy, or your parents live across town. A regular visit gives you peace of mind between your own.'],
  ['Elders recovering at home', 'After surgery or a hospital stay, a nurse or assistant helps with care, medicines and daily routine.'],
];
const SAMPLE = [['Blood pressure', '128 / 82 mmHg'], ['Pulse', '76 per minute'], ['Temperature', '98.4 F'], ['Oxygen level', '97 %'], ['Medicines', 'Taken as prescribed']];
const FAQ: [string, string][] = [
  ['Can I book a single visit first?', 'Yes. Book one visit, read the report, and decide about regular visits afterwards.'],
  ['Do I need to be at home?', 'No. Your parents or a family member nearby can let the assistant in. You can follow the visit from your account.'],
  ['Is the report a medical diagnosis?', 'No. It records measurements and observations. Please see a doctor for medical advice.'],
  ['What if the assistant finds something worrying?', 'They mark the visit as urgent. Our care desk and you are alerted immediately.'],
];

export default function HomePage() {
  return (
    <>
      <section className="relative bg-navy-dark">
        <img src={IMG.hero} alt="A caregiver with a smiling elderly couple" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy-dark/95 via-navy-dark/75 to-navy-dark/10" />
        <div className="relative mx-auto max-w-6xl px-4 pb-28 pt-16 sm:px-6 lg:pb-40 lg:pt-24">
          <p className="mb-4 inline-block rounded bg-white/15 px-3 py-1 text-sm font-semibold text-white">Elder care across India</p>
          <h1 className="display max-w-2xl text-4xl leading-tight text-white sm:text-5xl">Care for your parents in India, even when you cannot be there.</h1>
          <p className="mt-5 max-w-xl text-xl text-white/90">We send a trained assistant to their home, and send you a written report after every visit.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/customer/login?next=/customer/book" className="inline-flex items-center rounded-md bg-saffron px-7 py-3.5 text-lg font-semibold text-white hover:bg-saffron-dark">Book a visit</Link>
            <Link href="/contact" className="inline-flex items-center rounded-md border-2 border-white px-7 py-3 text-lg font-semibold text-white hover:bg-white/10">Write to our care desk</Link>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-16 max-w-6xl px-4 sm:px-6">
        <ul className="grid gap-px overflow-hidden rounded-md border border-rule bg-rule shadow-pop sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map(([I, t, b]) => (
            <li key={t} className="flex items-start gap-3 bg-white p-5">
              <I className="mt-0.5 h-7 w-7 shrink-0 text-leaf" aria-hidden />
              <div><p className="font-bold text-navy">{t}</p><p className="text-sm text-ink-muted">{b}</p></div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" id="services">
        <SectionTitle tag="Our services" title="How we can help your family" />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => (
            <article key={c.title} className="overflow-hidden rounded-md border border-rule bg-white">
              <img src={c.img} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />
              <div className="p-5">
                <h3 className="display text-xl text-navy">{c.title}</h3>
                <p className="mt-2 text-ink-muted">{c.body}</p>
              </div>
            </article>
          ))}
          <Link href="/contact" className="flex flex-col justify-center rounded-md bg-navy p-6 text-white hover:bg-navy-dark">
            <h3 className="display text-xl text-white">Not sure what your parents need?</h3>
            <p className="mt-2 text-white/85">Tell us about them and we will suggest a start.</p>
            <span className="mt-4 font-semibold text-saffron">Talk to us</span>
          </Link>
        </div>
        <p className="mt-8"><Link href="/our-services" className="font-semibold text-navy underline underline-offset-4">See the visits you can book</Link></p>
      </section>

      <section className="bg-sand">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <img src={IMG.aboutPhoto} alt="A granddaughter hugging her grandmother" loading="lazy" className="aspect-[7/5] w-full rounded-md object-cover" />
          <div>
            <SectionTitle tag="Why families choose us" title="You should always know how they are" />
            <ul className="mt-6 space-y-3">
              {REASONS.map((r) => <li key={r} className="flex items-start gap-3"><Check className="mt-1 h-5 w-5 shrink-0 text-leaf" aria-hidden />{r}</li>)}
            </ul>
            <Link href="/about" className="mt-6 inline-block font-semibold text-navy underline underline-offset-4">More about us</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <SectionTitle tag="Who we help" title="Made for families like yours" />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {WHO.map(([t, b]) => (
            <div key={t} className="border-t-4 border-leaf bg-sand p-6">
              <h3 className="display text-xl text-navy">{t}</h3>
              <p className="mt-2 text-ink-soft">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-navy">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div className="text-white">
            <p className="text-base font-semibold text-saffron">Your report</p>
            <h2 className="display mt-1 text-3xl text-white sm:text-4xl">See exactly what we saw</h2>
            <p className="mt-4 text-lg text-white/85">After each visit you receive a clear report with the readings, the assistant&apos;s notes and photos when needed. Share it with your parents&apos; doctor if you wish.</p>
            <Link href="/our-services" className="mt-6 inline-flex rounded-md bg-saffron px-6 py-3 font-semibold text-white hover:bg-saffron-dark">See what is checked</Link>
          </div>
          <div className="rounded-md bg-white p-6 shadow-pop">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <p className="font-bold text-navy">Visit report</p>
              <span className="rounded bg-leaf-soft px-2.5 py-0.5 text-sm font-semibold text-leaf">Completed</span>
            </div>
            <dl className="divide-y divide-rule">
              {SAMPLE.map(([k, v]) => <div key={k} className="flex justify-between py-2.5"><dt className="text-ink-muted">{k}</dt><dd className="font-semibold text-ink">{v}</dd></div>)}
            </dl>
            <p className="mt-3 text-xs text-ink-faint">Sample report. The details are made up for illustration.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <SectionTitle tag="How it works" title="Four steps from first message to first report" />
        <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([t, b], i) => (
            <li key={t}>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy font-bold text-white">{i + 1}</span>
              <h3 className="mt-3 text-lg font-bold text-navy">{t}</h3>
              <p className="mt-1 text-ink-muted">{b}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <SectionTitle tag="Questions" title="Before you book" />
        <div className="mt-8"><Faq items={FAQ} /></div>
      </section>

      <CtaBand />
    </>
  );
}
