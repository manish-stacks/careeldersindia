'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ListPager, SearchBar, useClientList } from '@/components/ui/list-controls';
import { Plus, ListChecks, Table2 } from 'lucide-react';
import { get, patch, post, del } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { ErrorState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Badge } from '@/components/ui/status';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form';

type Template = { _id: string; name: string; kind: 'CHECKLIST' | 'TABLE'; items: { key: string; label: string }[]; isActive: boolean };

export default function ReportTemplatesPage() {
  const q = useQuery({ queryKey: ['report-templates'], queryFn: () => get<Template[]>('/admin/report-templates') });
  const list = useClientList(q.data, (t) => `${t.name} ${t.items.map((i) => i.label).join(' ')}`, 12);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  return (
    <>
      <PageHeader
        title="Report sheets"
        subtitle="Digital copies of your paper sheets. Add a new sheet here, then tick it on a service so the assistant sees it in the visit form."
        actions={<Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" />New sheet</Button>}
      />
      <SearchBar value={list.q} onChange={list.setQ} placeholder="Search report sheets" />
      {q.isError && <ErrorState error={q.error} />}
      {q.isLoading && <Skeleton className="h-60" />}
      <div className="grid gap-4 lg:grid-cols-2">
        {list.rows.map((t) => (
          <article key={t._id} className={cn('panel flex flex-col p-5', !t.isActive && 'opacity-70')}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold">{t.name}</h2>
              <Badge tone={t.kind === 'CHECKLIST' ? 'brand' : 'neutral'}>
                {t.kind === 'CHECKLIST' ? <ListChecks className="mr-1 inline h-3.5 w-3.5" /> : <Table2 className="mr-1 inline h-3.5 w-3.5" />}
                {t.kind === 'CHECKLIST' ? 'Checklist' : 'Values / image'}
              </Badge>
            </div>
            <p className="mt-2 line-clamp-3 text-sm text-ink-muted">{t.items.map((i) => i.label).join(' · ')}</p>
            <div className="mt-auto flex items-center justify-between pt-5">
              <span className="text-sm text-ink-muted">{t.items.length} rows{t.isActive ? '' : ' · hidden'}</span>
              <Button size="sm" variant="secondary" onClick={() => setEditing(t)}>Edit</Button>
            </div>
          </article>
        ))}
      </div>
      <div className="panel mt-4"><ListPager meta={list.meta} onPage={list.setPage} /></div>
      {editing && <TemplateDialog template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function TemplateDialog({ template, onClose }: { template: Template | null; onClose: () => void }) {
  const [name, setName] = useState(template?.name || '');
  const [kind, setKind] = useState<Template['kind']>(template?.kind || 'CHECKLIST');
  const [rows, setRows] = useState(template?.items.map((i) => i.label).join('\n') || '');
  const [isActive, setActive] = useState(template?.isActive ?? true);
  const items = rows.split('\n').map((x) => x.trim()).filter(Boolean);
  const body = { name: name.trim(), kind, items, isActive };
  const save = useAction(() => (template ? patch(`/admin/report-templates/${template._id}`, body) : post('/admin/report-templates', body)), {
    success: template ? 'Sheet updated' : 'Sheet created', invalidate: [['report-templates']], onDone: onClose,
  });
  const hide = useAction(() => del(`/admin/report-templates/${template!._id}`), { success: 'Sheet hidden', invalidate: [['report-templates']], onDone: onClose });
  return (
    <Dialog
      open
      onClose={onClose}
      title={template ? 'Edit report sheet' : 'New report sheet'}
      description="One row per line, in the same order as the paper sheet."
      footer={
        <>
          {template && template.isActive && <Button variant="danger" className="mr-auto" onClick={() => hide.mutate(undefined)} loading={hide.isPending}>Hide</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={name.trim().length < 2 || !items.length}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Sheet name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Blood Haematology Report" /></Field>
        <Field label="Type" hint="Checklist = assistant ticks what was done. Values / image = assistant types a value per row or uploads a photo of the report.">
          <div className="flex gap-2">
            {(['CHECKLIST', 'TABLE'] as const).map((k) => (
              <Button key={k} size="sm" variant={kind === k ? 'primary' : 'secondary'} onClick={() => setKind(k)}>{k === 'CHECKLIST' ? 'Checklist' : 'Values / image'}</Button>
            ))}
          </div>
        </Field>
        <Field label={`Rows (${items.length})`}><Textarea rows={10} value={rows} onChange={(e) => setRows(e.target.value)} placeholder={'GRBS\nABG\nECG'} /></Field>
        <Checkbox label="Active" checked={isActive} onChange={setActive} />
      </div>
    </Dialog>
  );
}
