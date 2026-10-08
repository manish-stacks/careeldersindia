import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { pushSupported, registerPush } from '@/lib/push';
import { Button, Notice } from './ui';
import { S } from '@/lib/theme';

/** Shows only while notifications are off; one tap asks for permission (or opens Settings) and registers the FCM token. */
export function NotifyPrompt() {
  const [off, setOff] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const check = useCallback(async () => {
    if (!pushSupported()) return;
    const p = await Notifications.getPermissionsAsync();
    setOff(!p.granted);
    setBlocked(!p.granted && !p.canAskAgain);
    if (p.granted) registerPush().catch(() => {});
  }, []);
  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, [check]);
  if (!off) return null;
  const enable = async () => {
    if (blocked) return Linking.openSettings();
    await registerPush().catch(() => {});
    check();
  };
  return (
    <Notice tone="warn" icon="notifications-off-outline" title="Notifications are off"
      body="Turn them on to get visit updates, arrival alerts and reports on this phone."
      action={<Button title={blocked ? 'Open settings' : 'Turn on notifications'} size="md" onPress={enable} style={{ marginTop: S.sm, alignSelf: 'flex-start' }} />} />
  );
}
