'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { API_URL, getAccessToken, refreshSession } from './api';
import { useAuth } from './auth';
import { useToast } from '@/components/ui/toast';

export const EVENTS = {
  BOOKING_STATUS_CHANGED: 'BOOKING_STATUS_CHANGED',
  LOCATION_UPDATED: 'LOCATION_UPDATED',
  EMERGENCY_ALERT: 'EMERGENCY_ALERT',
  NOTIFICATION: 'NOTIFICATION',
  HEALTH_DATA_UPDATED: 'HEALTH_DATA_UPDATED',
  ASSISTANT_PRESENCE: 'ASSISTANT_PRESENCE',
  PAYMENT_UPDATED: 'PAYMENT_UPDATED',
} as const;

type Ctx = { socket: Socket | null; connected: boolean };
const SocketCtx = createContext<Ctx>({ socket: null, connected: false });

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [connected, setConnected] = useState(false);
  const ref = useRef<Socket | null>(null);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!user) return;
    const socket = io(API_URL, {
      transports: ['websocket'],
      auth: (cb) => cb({ token: getAccessToken() }), // re-read on every reconnect
      reconnectionDelayMax: 10000,
    });
    ref.current = socket;
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', async (err) => {
      setConnected(false);
      if (/token|auth|expired/i.test(err.message)) await refreshSession();
    });

    socket.on(EVENTS.BOOKING_STATUS_CHANGED, (p: { bookingId: string }) => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['booking', p.bookingId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['live-map'] });
    });
    socket.on(EVENTS.EMERGENCY_ALERT, (p: { type: string; status: string; message?: string }) => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (p.status === 'OPEN') toastRef.current.error(p.type === 'SOS' ? 'SOS raised' : 'Urgent health alert', p.message);
    });
    socket.on(EVENTS.NOTIFICATION, () => qc.invalidateQueries({ queryKey: ['notifications'] }));
    socket.on(EVENTS.ASSISTANT_PRESENCE, () => qc.invalidateQueries({ queryKey: ['assistants'] }));
    socket.on(EVENTS.PAYMENT_UPDATED, () => qc.invalidateQueries({ queryKey: ['payments'] }));

    return () => {
      socket.disconnect();
      ref.current = null;
    };
  }, [user, qc]);

  return <SocketCtx.Provider value={{ socket: ref.current, connected }}>{children}</SocketCtx.Provider>;
}

export const useSocket = () => useContext(SocketCtx);

/** Subscribe to one event for the lifetime of a component. */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void) {
  const { socket } = useSocket();
  const h = useRef(handler);
  h.current = handler;
  useEffect(() => {
    if (!socket) return;
    const fn = (p: T) => h.current(p);
    socket.on(event, fn);
    return () => {
      socket.off(event, fn);
    };
  }, [socket, event]);
}

/** Join a booking room (server checks access) for live updates on the detail page. */
export function useBookingRoom(bookingId?: string) {
  const { socket, connected } = useSocket();
  useEffect(() => {
    if (!socket || !connected || !bookingId) return;
    socket.emit('booking:subscribe', { bookingId });
    return () => {
      socket.emit('booking:unsubscribe', { bookingId });
    };
  }, [socket, connected, bookingId]);
}
