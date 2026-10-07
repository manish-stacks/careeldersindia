'use client';
import { useState } from 'react';
import { patch } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/form';

export function StatusDialog({ userId, name, active, onClose, invalidateKey }: { userId: string; name: string; active: boolean; onClose: () => void; invalidateKey: unknown[] }) {
  const [reason, setReason] = useState('');
  const act = useAction(() => patch(`/admin/users/${userId}/status`, { status: active ? 'SUSPENDED' : 'ACTIVE', reason }), { success: active ? `${name} suspended and signed out everywhere` : `${name} reactivated`, invalidate: [invalidateKey, ['customers'], ['assistants']], onDone: onClose });
  return (
    <Dialog open onClose={onClose} title={active ? `Suspend ${name}?` : `Reactivate ${name}?`} description={active ? 'They are signed out on all devices and cannot sign in until reactivated.' : 'They will be able to sign in again.'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={active ? 'danger' : 'primary'} onClick={() => act.mutate(undefined)} loading={act.isPending} disabled={reason.trim().length < 3}>{active ? 'Suspend' : 'Reactivate'}</Button></>}>
      <Field label="Reason" hint="Recorded in the audit log."><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Dialog>
  );
}
