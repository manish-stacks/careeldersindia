'use client';
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/lib/auth';
import { SocketProvider } from '@/lib/socket';
import { ApiFailure } from '@/lib/api';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            refetchOnWindowFocus: true,
            retry: (count, err) => !(err instanceof ApiFailure && err.status && err.status < 500) && count < 2,
          },
        },
      })
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>{children}</SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
