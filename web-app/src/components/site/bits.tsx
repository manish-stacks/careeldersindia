/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { IMG } from './images';

export const script = { fontFamily: "'Segoe Script','Brush Script MT','Lucida Handwriting',cursive" };

export function Tag({ children }: { children: ReactNode }) {
  return <span className="inline-block rounded-md bg-[#DDF0ED] px-3 py-1 text-sm font-semibold text-[#1B7F72]">{children}</span>;
}

export function SectionTitle({ tag, title, children }: { tag?: string; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-2xl">
      {tag && <Tag>{tag}</Tag>}
      <h2 className="display mt-3 text-3xl font-bold leading-tight text-[#0B3A53] sm:text-4xl">{title}</h2>
      {children && <p className="mt-3 text-lg leading-relaxed text-ink-muted">{children}</p>}
    </div>
  );
}

export function PageHero({ eyebrow, title, image, children }: { eyebrow?: string; title: string; image?: string; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-white via-[#F3FAF9] to-[#DDF0ED]">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1.2fr_1fr]">
        <div>
          {eyebrow && <Tag>{eyebrow}</Tag>}
          <h1 className="display mt-4 max-w-3xl text-4xl font-bold leading-tight text-[#0B3A53] sm:text-5xl">{title}</h1>
          {children && <p className="mt-5 max-w-2xl text-xl leading-relaxed text-ink-soft">{children}</p>}
        </div>
        {image && <img src={image} alt="" className="hidden w-full rounded-3xl object-cover shadow-xl ring-4 ring-white md:block" />}
      </div>
    </section>
  );
}

export function CtaBand({ title = 'Let\'s Make Their Tomorrow Brighter', text = 'Book a service today and experience the Care Elders India difference.' }: { title?: string; text?: string }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl bg-[#0E6A80]">
        <img src={IMG.hands} alt="" className="absolute inset-y-0 right-0 h-full w-full object-cover opacity-90 [mask-image:linear-gradient(to_right,transparent_35%,black_80%)]" />
        <div className="relative max-w-xl px-8 py-12 text-white sm:px-12">
          <p className="text-base text-white/85">Ready to give your loved ones the care they deserve?</p>
          <h2 className="display mt-1 text-white text-3xl font-bold sm:text-4xl">{title}</h2>
          <p className="mt-3 text-white/85">{text}</p>
          <Link href="/customer/login?next=/customer/book" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-lg font-semibold text-[#0B3A53] hover:bg-[#DDF0ED]">Book a Service <ArrowRight className="h-5 w-5" aria-hidden /></Link>
        </div>
      </div>
    </section>
  );
}

export function Faq({ items }: { items: [string, string][] }) {
  return (
    <div className="space-y-3">
      {items.map(([q, a]) => (
        <details key={q} className="group rounded-2xl border border-[#D6E8E6] bg-white px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer items-center justify-between gap-4 text-lg font-semibold text-[#0B3A53]">
            {q}
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DDF0ED] text-2xl leading-none text-[#1B7F72] transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="mt-3 max-w-2xl leading-relaxed text-ink-soft">{a}</p>
        </details>
      ))}
    </div>
  );
}
