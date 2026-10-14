'use client';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { PageHero } from '@/components/site/bits';

type Legal = { title: string; body: string };

/** Renders an admin-edited page: "# Heading" lines become headings, blank lines split paragraphs. */
export function LegalPage({ slug, eyebrow }: { slug: 'privacy' | 'terms'; eyebrow: string }) {
  const q = useQuery({ queryKey: ['legal', slug], queryFn: () => get<Legal>(`/legal/${slug}`), staleTime: 60_000 });
  const blocks = (q.data?.body || '').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <>
      <PageHero eyebrow={eyebrow} title={q.data?.title || eyebrow}>Please read this page carefully.</PageHero>
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        {q.isLoading ? <p className="text-ink-muted">Loading…</p> : q.error ? <p className="text-danger">This page could not be loaded. Please try again later.</p> : (
          <div className="space-y-5">
            {blocks.map((b, i) => b.startsWith('#') ? <h2 key={i} className="display pt-4 text-2xl text-navy">{b.replace(/^#+\s*/, '')}</h2> : <p key={i} className="whitespace-pre-line text-lg leading-relaxed text-ink-soft">{b}</p>)}
          </div>
        )}
      </div>
    </>
  );
}
