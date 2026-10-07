import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { takePending } from '@/lib/links';

export default function Index() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/login" />;
  // a deep link / notification that arrived before sign-in
  const pending = takePending();
  if (pending) return <Redirect href={pending as never} />;
  return <Redirect href={user.role === 'ASSISTANT' ? '/today' : '/home'} />;
}
