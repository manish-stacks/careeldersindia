/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { ArrowRight, CalendarCheck, Clock, HeartPulse, MessageSquareText, ShieldCheck, ClipboardList, Home, Heart, Users, UserCheck, Star, Quote, ShieldPlus } from 'lucide-react';
import { SectionTitle, CtaBand } from '@/components/site/bits';
import { CATEGORIES } from '@/components/site/content';
import { IMG } from '@/components/site/images';

const FEATURES = [
  { icon: HeartPulse, label: 'Compassionate Caregivers' },
  { icon: Clock, label: '24/7 Support' },
  { icon: ShieldCheck, label: 'Safe & Trusted Services' },
];
const STEPS = [
  { icon: MessageSquareText, title: 'Get in Touch', body: 'Tell us your requirements and preferences.' },
  { icon: ClipboardList, title: 'Personalized Plan', body: 'We create a care plan that fits your needs.' },
  { icon: Home, title: 'Care Begins', body: 'Our trained caregivers start the service.' },
  { icon: Heart, title: 'Ongoing Support', body: 'We stay connected for continuous care and updates.' },
];
const STATS = [
  { icon: Users, value: '500+', label: 'Happy Families' },
  { icon: UserCheck, value: '200+', label: 'Trained Caregivers' },
  { icon: ShieldPlus, value: '98%', label: 'Client Satisfaction' },
  { icon: Clock, value: '24/7', label: 'Round-the-clock Support' },
];
const REVIEWS = [
  { name: 'Priya Sharma', role: 'Daughter of Mr. R.K. Sharma', text: 'The team at Care Elders India is truly compassionate and professional. My father feels safe and happy, and that means everything to us.' },
  { name: 'Amit Verma', role: 'Son of Mrs. Sunita Verma', text: 'Excellent service and very caring staff. They took great care of my mother during her recovery. Highly recommended!' },
  { name: 'Neha Gupta', role: 'Daughter of Mrs. S. Gupta', text: 'The caregivers are kind, patient and well-trained. We are grateful for the peace of mind they provide.' },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-white via-[#F3FAF9] to-[#DDF0ED]">
        <div className="relative z-10 mx-auto max-w-6xl px-4 pb-10 pt-14 sm:px-6 lg:py-24">
          <div className="max-w-xl">
            <span className="inline-block rounded-md bg-[#DDF0ED] px-3 py-1 text-sm font-semibold text-[#1B7F72]">Trusted Elder Care Services In India</span>
            <h1 className="display mt-5 text-4xl font-bold leading-[1.15] text-[#0B3A53] sm:text-5xl">Because Every Elder Deserves <span className="text-[#1E8F7E]">Dignity, Care</span> and a <span className="text-[#1E8F7E]">Happier Tomorrow</span></h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-soft">Care Elders India provides professional and compassionate elder care services, helping your loved ones live safely, comfortably and with dignity, at home or in our care homes.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/our-services" className="inline-flex items-center gap-2 rounded-full bg-[#0B4F6C] px-7 py-3.5 text-lg font-semibold text-white shadow-lg hover:bg-[#093E55]">Explore Our Services <ArrowRight className="h-5 w-5" aria-hidden /></Link>
              <Link href="/contact" className="inline-flex items-center gap-2 rounded-full border-2 border-[#1E8F7E]/50 bg-white px-7 py-3.5 text-lg font-semibold text-[#0B3A53] hover:bg-[#F3FAF9]"><CalendarCheck className="h-5 w-5 text-[#1E8F7E]" aria-hidden />Book a Consultation</Link>
            </div>
            <ul className="mt-9 grid gap-4 sm:grid-cols-3">
              {FEATURES.map((f) => <li key={f.label} className="flex items-center gap-3 text-[15px] font-semibold leading-tight text-[#0B3A53]"><f.icon className="h-8 w-8 shrink-0 text-[#1E8F7E]" aria-hidden />{f.label}</li>)}
            </ul>
          </div>
        </div>
        <div className="relative h-72 sm:h-96 lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[56%]">
          <img src={IMG.hero} alt="A caregiver with a smiling elderly couple" className="h-full w-full object-cover lg:[mask-image:linear-gradient(to_right,transparent,black_28%)]" />
        </div>
      </section>

      {/* Services */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" id="services">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionTitle tag="Our Services" title="Comprehensive Elder Care Services">We offer a range of customized care solutions to meet the unique needs of every senior, because every stage of life matters.</SectionTitle>
          <Link href="/our-services" className="inline-flex items-center gap-2 text-lg font-semibold text-[#0B4F6C] hover:underline">View All Services <ArrowRight className="h-5 w-5" aria-hidden /></Link>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {CATEGORIES.map((c) => (
            <article key={c.title} className="flex flex-col overflow-hidden rounded-2xl border border-[#E3EFEE] bg-white shadow-sm transition-shadow hover:shadow-lg">
              <img src={c.img} alt="" className="h-32 w-full object-cover" />
              <div className="flex flex-1 flex-col px-5 pb-5">
                <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-[#1E8F7E] text-white ring-4 ring-white"><c.icon className="h-6 w-6" aria-hidden /></span>
                <h3 className="mt-3 text-lg font-bold leading-snug text-[#0B3A53]">{c.title}</h3>
                <p className="mt-2 flex-1 text-[15px] leading-relaxed text-ink-muted">{c.body}</p>
                <Link href="/our-services" className="mt-4 inline-flex items-center gap-1.5 font-semibold text-[#0B4F6C] hover:underline">Learn More <ArrowRight className="h-4 w-4" aria-hidden /></Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative overflow-hidden bg-gradient-to-r from-white via-white to-[#E6F4F1]">
        <div className="relative z-10 mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="lg:max-w-[54%]">
            <SectionTitle tag="How It Works" title="Simple Steps to Better Care">Getting started is easy. Just follow these simple steps and let us take care of the rest.</SectionTitle>
            <ol className="mt-8 grid gap-6 sm:grid-cols-2">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <div className="flex items-center gap-2">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#CFE9E4] bg-white text-[#1E8F7E]"><s.icon className="h-6 w-6" aria-hidden /></span>
                  </div>
                  <h3 className="mt-3 text-lg font-bold text-[#0B3A53]">{s.title}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <img src={IMG.aboutPhoto} alt="A granddaughter hugging her grandmother" className="pointer-events-none mx-auto h-64 w-full object-contain mix-blend-multiply sm:h-80 lg:absolute lg:inset-y-0 lg:right-0 lg:mx-0 lg:h-full lg:w-[48%] lg:object-right" />
      </section>

      {/* Why us */}
      <section id="why-us" className="scroll-mt-24 bg-gradient-to-r from-[#DDF0ED] to-[#EAF6F4]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <SectionTitle tag="Why Choose Us" title="Your Trust, Our Priority">At Care Elders India, we are committed to delivering high-quality, compassionate and reliable elder care services that families can trust.</SectionTitle>
            <Link href="/about" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#0B4F6C] px-7 py-3.5 text-lg font-semibold text-white hover:bg-[#093E55]">Learn More About Us <ArrowRight className="h-5 w-5" aria-hidden /></Link>
          </div>
          <ul className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {STATS.map((s) => (
              <li key={s.label} className="text-center">
                <s.icon className="mx-auto h-10 w-10 text-[#1E8F7E]" aria-hidden />
                <p className="display mt-2 text-3xl font-bold text-[#0B3A53]">{s.value}</p>
                <p className="mt-1 text-[15px] font-medium text-ink-soft">{s.label}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
        <SectionTitle tag="Testimonials" title="What Families Say About Us">Real stories from real families who trust Care Elders India.</SectionTitle>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {REVIEWS.map((r, i) => (
            <figure key={r.name} className="flex flex-col rounded-2xl border border-[#E3EFEE] bg-white p-6 shadow-sm">
              <Quote className="h-8 w-8 text-[#9ED6CC]" aria-hidden />
              <blockquote className="mt-2 flex-1 leading-relaxed text-ink-soft">{r.text}</blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ${['bg-[#1E8F7E]', 'bg-[#0B4F6C]', 'bg-[#C0576B]'][i]}`} aria-hidden>{r.name[0]}</span>
                <div>
                  <p className="font-bold text-[#0B3A53]">{r.name}</p>
                  <p className="text-sm text-ink-muted">{r.role}</p>
                  <p className="mt-0.5 flex text-[#F4B63F]" aria-label="5 out of 5 stars">{[0, 1, 2, 3, 4].map((n) => <Star key={n} className="h-4 w-4 fill-current" aria-hidden />)}</p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <CtaBand />
    </>
  );
}
