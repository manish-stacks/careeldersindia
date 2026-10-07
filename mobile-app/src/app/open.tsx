import { Redirect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { rememberPending, screenHref } from '@/lib/links';

/** Role-aware landing for /open?screen=…&id=… (from short links and notifications). */
export default function Open() {
  const { screen, id } = useLocalSearchParams<{ screen?: string; id?: string }>();
  const { user } = useAuth();
  if (!user) {
    rememberPending(`/open?screen=${screen || ''}${id ? `&id=${id}` : ''}`);
    return <Redirect href="/login" />;
  }
  const href = screenHref(screen, id, user.role) || (user.role === 'ASSISTANT' ? '/today' : '/home');
  return <Redirect href={href as never} />;
}
