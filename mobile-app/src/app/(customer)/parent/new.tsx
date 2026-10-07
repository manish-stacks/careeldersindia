import { router } from 'expo-router';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import type { Parent } from '@/lib/types';
import { ParentForm, type ParentPayload } from '@/components/parent-form';

export default function NewParent() {
  const save = useAction((p: ParentPayload) => api.post<Parent>('/customer/parents', p), {
    success: 'Parent added',
    invalidate: [['parents'], ['home']],
    onDone: (p) => router.replace(`/parent/${p._id}`),
  });
  return <ParentForm submitLabel="Save" busy={save.isPending} onSubmit={(p) => save.mutate(p)} />;
}
