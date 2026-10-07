'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Mutation with success/error toasts and cache invalidation. */
export function useAction<TVars, TRes = unknown>(fn: (v: TVars) => Promise<TRes>, { success, invalidate = [], onDone }: { success?: string | ((r: TRes) => string); invalidate?: QueryKey[]; onDone?: (r: TRes) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (success) toast.success(typeof success === 'function' ? success(r) : success);
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      onDone?.(r);
    },
    onError: (e: Error) => toast.error('Action failed', e.message),
  });
}

/** Now, ticking every `ms` — for live relative times / timeline cursor. */
export function useNow(ms = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}
