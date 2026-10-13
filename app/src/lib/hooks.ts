import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useToast } from '@/components/toast';
import { ApiError } from './api';

/** Mutation + toast + cache invalidation. Errors surface as an alert with the server's message. */
export function useAction<V = void, R = unknown>(fn: (v: V) => Promise<R>, o: { success?: string | ((r: R) => string); invalidate?: QueryKey[]; onDone?: (r: R) => void; onError?: (e: ApiError | Error) => boolean | void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<R, Error, V>({
    mutationFn: fn,
    onSuccess: (r) => {
      if (o.success) toast(typeof o.success === 'function' ? o.success(r) : o.success);
      o.invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      o.onDone?.(r);
    },
    onError: (e) => {
      if (o.onError?.(e) === true) return;
      Alert.alert('Could not complete', e.message);
    },
  });
}

export function confirm(title: string, message: string, ok = 'Yes', destructive = false) {
  return new Promise<boolean>((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ])
  );
}

export function useDebounced<T>(v: T, ms = 400) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function useNow(ms = 30000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

/** Keeps the latest value in a ref for use inside timers/listeners. */
export function useLatest<T>(v: T) {
  const r = useRef(v);
  r.current = v;
  return r;
}
