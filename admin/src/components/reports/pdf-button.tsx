'use client';
import { Download } from 'lucide-react';
import { get } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Button } from '@/components/ui/button';

/** Opens the signed PDF of a report. Safe to place inside a clickable table row. */
export function PdfButton({ reportId }: { reportId: string }) {
  const open = useAction(() => get<{ url: string }>(`/admin/reports/${reportId}/pdf`), { onDone: (r) => window.open(r.url, '_blank', 'noopener') });
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Button size="sm" variant="secondary" onClick={() => open.mutate(undefined)} loading={open.isPending}><Download className="h-4 w-4" />PDF</Button>
    </span>
  );
}
