import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import type { Parent } from '@/lib/types';
import { ErrorView, Loading } from '@/components/ui';
import { ParentForm, type ParentPayload } from '@/components/parent-form';

export default function EditParent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['parent', id], queryFn: () => api.get<Parent>(`/customer/parents/${id}`) });
  const save = useAction((p: ParentPayload) => api.patch(`/customer/parents/${id}`, p), {
    success: 'Details updated',
    invalidate: [['parent', id], ['parents'], ['home']],
    onDone: () => router.back(),
  });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  return <ParentForm initial={q.data} submitLabel="Save changes" busy={save.isPending} onSubmit={(p) => save.mutate(p)} />;
}
