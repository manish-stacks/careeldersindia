'use client';
import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { get, post } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { IMG } from '@/components/site/images';
import { PageHero } from '@/components/site/bits';
import { Field, Input, Textarea } from '@/components/ui/form';

type Contact = { email: string; phone: string; whatsapp: string; address: string; hours: string };

export default function ContactPage() {
  const { data } = useQuery({ queryKey: ['public-contact'], queryFn: () => get<Contact>('/contact'), staleTime: 300_000 });
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await post('/enquiry', { ...form, phone: form.phone || undefined });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your message');
    } finally {
      setBusy(false);
    }
  }

  const rows = [
    { k: 'Email', v: data?.email }, { k: 'Phone', v: data?.phone || data?.whatsapp }, { k: 'Address', v: data?.address }, { k: 'Hours', v: data?.hours },
  ].filter((r) => r.v);

  return (
    <>
      <PageHero image={IMG.nursing} eyebrow="Contact" title="Talk to our care desk">Tell us about your parents and what you need. We will reply by email or phone.</PageHero>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1.5fr_1fr]">
        {done ? (
          <div className="rounded-md border border-rule bg-white p-10 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-leaf" />
            <h2 className="display mt-4 text-2xl text-navy">Message sent</h2>
            <p className="mt-2 text-ink-soft">Thank you. Our care desk will contact you shortly.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-md border border-rule bg-white p-6 sm:p-10" noValidate>
            <Field label="Your name" htmlFor="c-name"><Input className="h-12 text-lg" id="c-name" value={form.name} onChange={set('name')} required /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" htmlFor="c-email"><Input className="h-12 text-lg" id="c-email" type="email" value={form.email} onChange={set('email')} required /></Field>
              <Field label="Phone (optional)" htmlFor="c-phone"><Input type="tel" className="h-12 text-lg" id="c-phone" value={form.phone} onChange={set('phone')} placeholder="+1 555 000 0000" /></Field>
            </div>
            <Field label="How can we help?" htmlFor="c-msg" hint="At least 10 characters. Mention your parent's city and PIN code if you can."><Textarea className="text-lg" id="c-msg" rows={5} value={form.message} onChange={set('message')} required /></Field>
            {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            <Button type="submit" size="lg" loading={busy} disabled={!form.name || !form.email || form.message.trim().length < 10}>Send message</Button>
          </form>
        )}
        <aside className="space-y-4 self-start rounded-md bg-navy p-8 text-white">
          <h2 className="display text-2xl text-white">Care desk</h2>
          {rows.map((r) => <p key={r.k} className="text-white/90"><span className="block text-xs font-semibold uppercase tracking-[0.14em] text-saffron">{r.k}</span>{r.v}</p>)}
          {!rows.length && <p className="text-white/75">Use the form and we will reply by email.</p>}
        </aside>
      </div>
    </>
  );
}
