'use client';
import { useState } from 'react';
import { get } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Panel } from '@/components/ui/misc';

/** Day-wise / month-wise sheet of what the assistants recorded (Excel or PDF). */
export function SheetDownload({ parentId }: { parentId: string }) {
  const toast = useToast();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState('');
  async function download(format: 'xlsx' | 'pdf') {
    setBusy(format);
    try {
      const q = date ? `date=${date}` : `month=${month}`;
      const r = await get<{ url: string }>(`/admin/parents/${parentId}/sheet-link?${q}&format=${format}`);
      window.open(r.url, '_blank');
    } catch (e) {
      toast.error('Could not create the sheet', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy('');
    }
  }
  return (
    <Panel title="Download daily / monthly sheet">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">Month<Input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setDate(''); }} /></label>
        <label className="text-sm font-medium">Or one day<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <Button onClick={() => download('xlsx')} loading={busy === 'xlsx'}>Excel</Button>
        <Button variant="secondary" onClick={() => download('pdf')} loading={busy === 'pdf'}>PDF</Button>
      </div>
    </Panel>
  );
}
