import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { API_URL, getAccessToken, refreshSession } from './api';
import { useAuth } from './auth';

export const EV = {
  STATUS: 'BOOKING_STATUS_CHANGED',
  LOCATION: 'LOCATION_UPDATED',
  HEALTH: 'HEALTH_DATA_UPDATED',
  ALERT: 'EMERGENCY_ALERT',
  NOTIFICATION: 'NOTIFICATION',
  PAYMENT: 'PAYMENT_UPDATED',
  JOB_ASSIGNED: 'JOB_ASSIGNED',
  JOB_CANCELLED: 'JOB_CANCELLED',
  REPORT: 'REPORT_GENERATED',
} as const;

const Ctx = createContext<{ socket: Socket | null; connected: boolean }>({ socket: null, connected: false });

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) return;
    const s = io(API_URL, { transports: ['websocket'], auth: (cb) => cb({ token: getAccessToken() }), reconnectionDelayMax: 15000 });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', async (e) => {
      setConnected(false);
      if (/token|auth|expired/i.test(e.message)) await refreshSession();
    });
    const inv = (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    s.on(EV.STATUS, (p: { bookingId?: string }) => {
      inv('home', 'bookings', 'jobs');
      if (p?.bookingId) qc.invalidateQueries({ queryKey: ['booking', p.bookingId] });
    });
    [EV.JOB_ASSIGNED, EV.JOB_CANCELLED].forEach((e) => s.on(e, () => inv('home', 'jobs')));
    s.on(EV.REPORT, () => inv('home', 'reports', 'bookings'));
    s.on(EV.NOTIFICATION, () => inv('notifications'));
    s.on(EV.PAYMENT, () => inv('payments', 'home', 'bookings'));
    setSocket(s);
    // phones drop sockets in the background — reconnect when the app comes back
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && !s.connected) s.connect();
    });
    return () => {
      sub.remove();
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [user, qc]);

  return <Ctx.Provider value={{ socket, connected }}>{children}</Ctx.Provider>;
}

export const useSocket = () => useContext(Ctx);

export function useSocketEvent<T>(event: string, handler: (p: T) => void) {
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
