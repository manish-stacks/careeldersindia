import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAction, confirm } from '@/lib/hooks';
import { S } from '@/lib/theme';
import type { Parent } from '@/lib/types';
import { Badge, Button, Card, Chip, ErrorView, Field, Input, Loading, Notice, Screen, Section, T } from '@/components/ui';

const PERMS = [
  { value: 'VIEW', label: 'See reports' },
  { value: 'BOOK', label: 'Book visits' },
  { value: 'MANAGE', label: 'Edit details' },
];

export default function Family() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['parent', id], queryFn: () => api.get<Parent>(`/customer/parents/${id}`) });
  const [email, setEmail] = useState('');
  const [relation, setRelation] = useState('');
  const [perms, setPerms] = useState<string[]>(['VIEW']);
  const invite = useAction(() => api.post(`/customer/parents/${id}/family`, { email: email.trim(), relation: relation.trim() || undefined, permissions: perms }), {
    success: 'Invite sent',
    invalidate: [['parent', id]],
    onDone: () => {
      setEmail('');
      setRelation('');
      setPerms(['VIEW']);
    },
  });
  const revoke = useAction((memberId: string) => api.del(`/customer/parents/${id}/family/${memberId}`), { success: 'Access removed', invalidate: [['parent', id]] });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const members = (q.data.family || []).filter((f) => f.status !== 'REVOKED');

  return (
    <Screen>
      <T v="small">Share {q.data.fullName}&apos;s reports with siblings or relatives. They sign in with their own account.</T>
      <Section title="People with access">
        <View style={{ gap: S.sm }}>
          {members.map((m) => (
            <Card key={m._id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.sm }}>
                <View style={{ flex: 1 }}>
                  <T weight="semibold">{m.userId?.name || m.invitedEmail}</T>
                  <T v="small">{m.isOwner ? 'Owner' : m.relation || 'Family'} · {m.permissions.map((p) => PERMS.find((x) => x.value === p)?.label.toLowerCase()).join(', ')}</T>
                </View>
                {m.status === 'INVITED' ? <Badge label="Invited" tone="warn" /> : m.isOwner ? <Badge label="You" tone="brand" /> : null}
              </View>
              {!m.isOwner && (
                <Button title="Remove access" variant="ghost" size="md" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={async () => (await confirm('Remove access?', `${m.userId?.name || m.invitedEmail} will no longer see this profile.`, 'Remove', true)) && revoke.mutate(m._id)} />
              )}
            </Card>
          ))}
        </View>
      </Section>
      <Section title="Invite someone">
        <Card>
          <Field label="Their email"><Input value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" /></Field>
          <Field label="Relation"><Input value={relation} onChangeText={setRelation} placeholder="e.g. Sister" /></Field>
          <Field label="What can they do?">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
              {PERMS.map((p) => (
                <Chip key={p.value} label={p.label} selected={perms.includes(p.value)} onPress={() => setPerms(p.value === 'VIEW' ? perms : perms.includes(p.value) ? perms.filter((x) => x !== p.value) : [...perms, p.value])} />
              ))}
            </View>
          </Field>
          <Button title="Send invite" loading={invite.isPending} disabled={!email.includes('@')} onPress={() => invite.mutate()} />
        </Card>
        <View style={{ marginTop: S.md }}>
          <Notice tone="info" title="How invites work" body="If they already have a Care Elders India account, access starts right away. Otherwise it starts when they sign up with this email." />
        </View>
      </Section>
    </Screen>
  );
}
