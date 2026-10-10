import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/hooks';
import { pushSupported } from '@/lib/push';
import { S } from '@/lib/theme';
import { Card, Notice, Row, Screen, T } from '@/components/ui';

type Contact = { email?: string; phone?: string; whatsapp?: string };

export default function Account() {
  const { user, signOut } = useAuth();
  const { data: contact } = useQuery({ queryKey: ['contact'], queryFn: () => api.get<Contact>('/contact'), staleTime: 5 * 60_000 });
  return (
    <Screen tabbed>
      <T v="title">{user?.name}</T>
      <T v="small" style={{ marginBottom: S.lg }}>{user?.email}</T>
      <Card style={{ paddingVertical: 0 }}>
        <Row icon="person-outline" title="Your details" onPress={() => router.push('/profile')} />
        <Row icon="repeat-outline" title="Recurring plans" subtitle="Regular visits, paid in advance" onPress={() => router.push('/plans')} />
        <Row icon="card-outline" title="Payments and refunds" onPress={() => router.push('/payments')} />
        <Row icon="notifications-outline" title="Notifications" onPress={() => router.push('/notifications')} last />
      </Card>
      <Card style={{ paddingVertical: 0, marginTop: S.lg }}>
        {contact?.phone ? <Row icon="call-outline" title="Call the care team" subtitle={contact.phone} onPress={() => Linking.openURL(`tel:${contact.phone}`)} /> : null}
        {contact?.email ? <Row icon="mail-outline" title="Email us" subtitle={contact.email} onPress={() => Linking.openURL(`mailto:${contact.email}`)} /> : null}
        <Row icon="warning-outline" title="Emergency help" onPress={() => router.push('/sos')} danger />
        <Row icon="key-outline" title="Change password" onPress={() => router.push('/change-password')} last />
      </Card>
      {!pushSupported() && (
        <View style={{ marginTop: S.lg }}>
          <Notice tone="info" title="Push alerts are off in this build" body="You'll still see updates inside the app. Install the Care Elders India app build to get alerts on your phone." />
        </View>
      )}
      <Card style={{ paddingVertical: 0, marginTop: S.lg }}>
        <Row icon="log-out-outline" title="Sign out" danger last onPress={async () => (await confirm('Sign out?', 'You can sign back in any time.', 'Sign out')) && signOut()} />
      </Card>
      <T v="caption" style={{ textAlign: 'center', marginTop: S.xl }}>Care Elders India {Constants.expoConfig?.version}</T>
    </Screen>
  );
}
