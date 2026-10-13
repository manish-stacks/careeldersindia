'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Send, CheckCheck } from 'lucide-react';
import { get, http, post, type PageMeta } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { cn, dateTime, relative } from '@/lib/utils';
import { Empty, PageHeader, Pagination, Panel, Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';

type Note = { _id: string; type: string; title: string; body: string; data?: Record<string, string>; readAt?: string | null; createdAt: string };
type Broadcast = { _id: string; createdAt: string; actorId?: { name: string }; metadata?: { audience?: string; title?: string; recipients?: number; screen?: string; url?: string } };

const AUDIENCE: Record<string, string> = { ALL_CUSTOMERS: 'All families', ALL_ASSISTANTS: 'All assistants', APPROVED_ASSISTANTS: 'Approved assistants only' };

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const inbox = useQuery({
    queryKey: ['notifications', page],
    queryFn: async () => {
      const r = await http.get<{ data: Note[]; meta: PageMeta & { unread: number } }>(`/notifications?page=${page}&limit=20`);
      return r.data;
    },
    placeholderData: keepPreviousData,
  });
  const sent = useQuery({ queryKey: ['notifications', 'broadcasts'], queryFn: () => get<Broadcast[]>('/admin/notifications/broadcasts') });
  const readAll = useAction(() => post('/notifications/read', { all: true }), { invalidate: [['notifications']] });
  const readOne = useAction((id: string) => post('/notifications/read', { ids: [id] }), { invalidate: [['notifications']] });

  return (
    <>
      <PageHeader title="Notifications" subtitle="Your desk inbox, and announcements to families or assistants." />
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Panel
          title={`Inbox${inbox.data?.meta.unread ? ` (${inbox.data.meta.unread} unread)` : ''}`}
          bodyClass="p-0"
          action={!!inbox.data?.meta.unread && <Button size="sm" variant="ghost" onClick={() => readAll.mutate(undefined)}><CheckCheck className="h-4 w-4" />Mark all read</Button>}
        >
          {inbox.isLoading && <Skeleton className="m-5 h-40" />}
          {inbox.data && !inbox.data.data.length && <Empty title="Nothing yet" body="Payments, rejections, SOS and urgent visits show up here." />}
          <ul>
            {inbox.data?.data.map((n) => {
              const href = n.data?.bookingId ? `/bookings/${n.data.bookingId}` : n.data?.alertId ? '/emergency-alerts' : undefined;
              return (
                <li key={n._id} className={cn('flex gap-3 border-b border-line px-5 py-3 last:border-0', !n.readAt && 'bg-brand-soft/40')}>
                  <span className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand')} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{href ? <Link href={href} className="hover:underline" onClick={() => !n.readAt && readOne.mutate(n._id)}>{n.title}</Link> : n.title}</p>
                    <p className="text-[15px] text-ink-soft">{n.body}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">{relative(n.createdAt)}</p>
                  </div>
                  {!n.readAt && <button className="self-start text-sm text-ink-muted hover:text-ink" onClick={() => readOne.mutate(n._id)}>Mark read</button>}
                </li>
              );
            })}
          </ul>
          <Pagination meta={inbox.data?.meta} onPage={setPage} />
        </Panel>

        <div className="space-y-6">
          <Compose />
          <Panel title="Recently sent" bodyClass="p-0">
            <ul>
              {sent.data?.map((b) => (
                <li key={b._id} className="border-b border-line px-5 py-3 last:border-0">
                  <p className="font-medium">{b.metadata?.title}</p>
                  <p className="text-sm text-ink-muted">{AUDIENCE[b.metadata?.audience || ''] || 'Selected people'} · {b.metadata?.recipients ?? '?'} people{b.metadata?.screen ? ` · opens ${b.metadata.screen}` : b.metadata?.url ? ' · opens link' : ''} · {b.actorId?.name} · {dateTime(b.createdAt)}</p>
                </li>
              ))}
              {sent.data && !sent.data.length && <li className="px-5 py-6 text-ink-muted">No announcements sent yet.</li>}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}

type Screen = { key: string; label: string; roles: ('CUSTOMER' | 'ASSISTANT')[]; param?: string };
const PARAM_LABEL: Record<string, string> = { bookingId: 'Booking ID', reportId: 'Report ID', parentId: 'Parent ID', planId: 'Plan ID' };

function Compose() {
  const [audience, setAudience] = useState('ALL_CUSTOMERS');
  const [emails, setEmails] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<'none' | 'screen' | 'url'>('none');
  const [screen, setScreen] = useState('');
  const [recordId, setRecordId] = useState('');
  const [url, setUrl] = useState('');
  const [confirm, setConfirm] = useState(false);
  const screens = useQuery({ queryKey: ['notifications', 'screens'], queryFn: () => get<Screen[]>('/admin/notifications/screens'), staleTime: Infinity });

  const role = audience === 'ALL_CUSTOMERS' ? 'CUSTOMER' : audience === 'USERS' ? null : 'ASSISTANT';
  const options = (screens.data || []).filter((s) => !role || s.roles.includes(role));
  const chosen = options.find((s) => s.key === screen);
  const emailList = emails.split(/[\s,;]+/).map((e) => e.trim()).filter((e) => e.includes('@'));

  const payload = {
    audience,
    title,
    body,
    ...(audience === 'USERS' ? { emails: emailList } : {}),
    ...(target === 'screen' && screen ? { screen, ...(chosen?.param ? { recordId: recordId.trim() } : {}) } : {}),
    ...(target === 'url' && url.trim() ? { url: url.trim() } : {}),
  };
  const send = useAction(() => post<{ recipients: number }>('/admin/notifications/broadcast', payload), {
    success: (r) => `Sent to ${r.data.recipients} people`,
    invalidate: [['notifications', 'broadcasts']],
    onDone: () => { setTitle(''); setBody(''); setConfirm(false); setTarget('none'); setScreen(''); setRecordId(''); setUrl(''); },
  });
  const targetOk = target === 'none' || (target === 'screen' && !!chosen && (!chosen.param || /^[a-f\d]{24}$/i.test(recordId.trim()))) || (target === 'url' && /^(https:\/\/|careeldersindia:\/\/)/.test(url.trim()));
  const valid = title.trim().length >= 3 && body.trim().length >= 3 && targetOk && (audience !== 'USERS' || emailList.length > 0);
  const audienceLabel = audience === 'USERS' ? `${emailList.length} selected ${emailList.length === 1 ? 'person' : 'people'}` : AUDIENCE[audience].toLowerCase();

  return (
    <Panel title="Send an announcement">
      <div className="space-y-4">
        <Field label="Send to">
          <Select value={audience} onChange={(e) => { setAudience(e.target.value); setConfirm(false); setScreen(''); }}>
            {Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            <option value="USERS">Specific people (by email)</option>
          </Select>
        </Field>
        {audience === 'USERS' && (
          <Field label="Emails" hint="Separate with commas or new lines. Customers and assistants only.">
            <Textarea value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="rohan@example.com, neha@careeldersindia.com" />
          </Field>
        )}
        <Field label="Title" hint={`${title.length}/80`}><Input maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Visits during Diwali week" /></Field>
        <Field label="Message" hint={`${body.length}/300. Arrives as a push notification and in their inbox.`}><Textarea maxLength={300} value={body} onChange={(e) => setBody(e.target.value)} /></Field>

        <Field label="When they tap it, open">
          <Select value={target} onChange={(e) => setTarget(e.target.value as typeof target)}>
            <option value="none">The notifications list</option>
            <option value="screen">A screen in the app</option>
            <option value="url">A link</option>
          </Select>
        </Field>
        {target === 'screen' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Screen">
              <Select value={screen} onChange={(e) => setScreen(e.target.value)}>
                <option value="">Choose…</option>
                {options.map((s) => <option key={s.key} value={s.key}>{s.label}{audience === 'USERS' ? ` (${s.roles.map((r) => r.toLowerCase()).join(', ')})` : ''}</option>)}
              </Select>
            </Field>
            {chosen?.param && (
              <Field label={PARAM_LABEL[chosen.param] || 'Record ID'} hint="Copy it from the record's URL in this console.">
                <Input value={recordId} onChange={(e) => setRecordId(e.target.value)} placeholder="24-character ID" />
              </Field>
            )}
          </div>
        )}
        {target === 'url' && (
          <Field label="Link" hint="https:// opens the browser (or the app, for careeldersindia.com/app/… links). careeldersindia:// opens an app screen.">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://careeldersindia.com/app/plans" />
          </Field>
        )}
        {confirm ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-warn-soft px-3 py-2">
            <span className="text-sm text-warn">Send to {audienceLabel}? This can&apos;t be undone.</span>
            <span className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>Back</Button><Button size="sm" onClick={() => send.mutate(undefined)} loading={send.isPending}>Send now</Button></span>
          </div>
        ) : (
          <div className="flex justify-end"><Button onClick={() => setConfirm(true)} disabled={!valid}><Send className="h-4 w-4" />Review and send</Button></div>
        )}
      </div>
    </Panel>
  );
}
