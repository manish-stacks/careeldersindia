/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import { IMG } from '@/components/site/images';
import { PageHero, CtaBand, SectionTitle, Faq } from '@/components/site/bits';

export const metadata: Metadata = { title: 'About us', description: 'Care Elders India helps families abroad look after their parents at home in India.' };

const VALUES = [
  ['Dignity first', 'Every elder is treated with respect, patience and kindness.'],
  ['Full transparency', 'Families see who visits, when, and what was recorded.'],
  ['Safety always', 'Urgent concerns reach the care desk and the family immediately.'],
  ['Honest reports', 'We record measurements and observations. We never diagnose.'],
];
const VERIFY = [
  ['Documents checked', 'Identity and qualification documents are reviewed by our care desk.'],
  ['Trained for home visits', 'Assistants follow a fixed checklist for vitals, medicines and wellbeing.'],
  ['Supervised', 'Every booking, assignment and report is visible to our care desk and recorded.'],
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

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <img src={IMG.aboutPhoto} alt="A granddaughter hugging her grandmother" loading="lazy" className="aspect-[4/3] w-full rounded-md object-cover" />
        <div>
          <SectionTitle tag="Our story" title="What we believe" />
          <div className="mt-5 space-y-4 text-lg text-ink-soft">
            <p>Good care starts with paying attention. A regular visit by someone trained to notice small changes can catch a problem early and give a family real reassurance.</p>
            <p>We built Care Elders India around that idea. Families book, trained assistants visit, and a care desk watches over every step. The result is a report you can trust and a team you can reach.</p>
          </div>
          <Link href="/contact" className="btn-solid mt-6">Talk to our care desk</Link>
        </div>
      </section>

      <section className="bg-sand">
        <div className="mx-auto grid max-w-5xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.4fr]">
          <SectionTitle tag="What we hold to" title="Four things we will not trade away" />
          <ul className="space-y-6">
            {VALUES.map(([t, b]) => (
              <li key={t} className="border-l-4 border-leaf pl-5">
                <h3 className="display text-xl text-navy">{t}</h3>
                <p className="mt-1 text-ink-soft">{b}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <SectionTitle tag="Our assistants" title="Who comes to your parents' door" />
        <div className="mt-6 max-w-2xl space-y-4 text-lg text-ink-soft">
          {VERIFY.map(([t, b]) => <p key={t}><strong className="font-semibold text-navy">{t}.</strong> {b}</p>)}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <SectionTitle tag="Questions" title="What families usually ask" />
        <div className="mt-8"><Faq items={FAQ} /></div>
      </section>

      <CtaBand />
    </>
  );
}
