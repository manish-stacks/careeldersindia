import { View } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/hooks';
import { pushSupported } from '@/lib/push';
import { S } from '@/lib/theme';
import { Card, Notice, Row, Screen, T } from '@/components/ui';

const SUPPORT_PHONE = process.env.EXPO_PUBLIC_SUPPORT_PHONE || '+911800000000';

export default function Account() {
  const { user, signOut } = useAuth();
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
        <Row icon="call-outline" title="Call the care team" subtitle={SUPPORT_PHONE} onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)} />
        <Row icon="warning-outline" title="Emergency help" onPress={() => router.push('/sos')} danger />
        <Row icon="key-outline" title="Change password" onPress={() => router.push('/change-password')} last />
      </Card>
      {!pushSupported() && (
        <View style={{ marginTop: S.lg }}>
          <Notice tone="info" title="Push alerts are off in this build" body="You'll still see updates inside the app. Install the ParentCare app build to get alerts on your phone." />
        </View>
      )}
      <Card style={{ paddingVertical: 0, marginTop: S.lg }}>
        <Row icon="log-out-outline" title="Sign out" danger last onPress={async () => (await confirm('Sign out?', 'You can sign back in any time.', 'Sign out')) && signOut()} />
      </Card>
      <T v="caption" style={{ textAlign: 'center', marginTop: S.xl }}>ParentCare {Constants.expoConfig?.version}</T>
    </Screen>
  );
}
