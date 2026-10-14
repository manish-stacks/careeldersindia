/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const script = { fontFamily: "'Segoe Script','Brush Script MT','Lucida Handwriting',cursive" };

export function Tag({ children }: { children: ReactNode }) {
  return <p className="text-base font-semibold text-leaf">{children}</p>;
}

export function SectionTitle({ tag, title, children }: { tag?: string; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-2xl">
      {tag && <Tag>{tag}</Tag>}
      <h2 className="display mt-1 text-3xl leading-tight text-navy sm:text-4xl">{title}</h2>
      {children && <p className="mt-3 text-lg text-ink-muted">{children}</p>}
    </div>
  );
}

export function PageHero({ eyebrow, title, image, children }: { eyebrow?: string; title: string; image?: string; children?: ReactNode }) {
  return (
    <section className="bg-navy text-white">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-[1.3fr_1fr]">
        <div>
          {eyebrow && <p className="text-base font-semibold text-saffron">{eyebrow}</p>}
          <h1 className="display mt-1 max-w-3xl text-4xl leading-tight text-white sm:text-5xl">{title}</h1>
          {children && <p className="mt-4 max-w-2xl text-xl text-white/85">{children}</p>}
        </div>
        {image && <img src={image} alt="" className="hidden aspect-[3/2] w-full rounded-md object-cover md:block" />}
      </div>
    </section>
  );
}

export function CtaBand({ title = 'Ready when you are', text = 'Pick a service and a day. We will send someone to the door and write to you afterwards.' }: { title?: string; text?: string }) {
  return (
    <section className="bg-leaf">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-14 sm:px-6">
        <div className="max-w-xl">
          <h2 className="display mt-1 text-3xl text-white sm:text-4xl">{title}</h2>
          <p className="mt-3 text-white/80">{text}</p>
        </div>
        <Link href="/customer/login?next=/customer/book" className="inline-flex items-center gap-2 rounded-md bg-white px-7 py-3.5 text-lg font-semibold text-navy hover:bg-sand">Book a visit <ArrowRight className="h-5 w-5" aria-hidden /></Link>
      </div>
    </section>
  );
}

export function Faq({ items }: { items: [string, string][] }) {
  return (
    <div className="divide-y divide-rule border-y border-rule">
      {items.map(([q, a]) => (
        <details key={q} className="group py-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer items-center justify-between gap-4 text-lg font-semibold text-navy">
            {q}
            <span className="text-2xl font-normal leading-none text-leaf transition-transform group-open:rotate-45" aria-hidden>+</span>
          </summary>
          <p className="mt-3 max-w-2xl text-ink-soft">{a}</p>
        </details>
      ))}
    </div>
  );
}
