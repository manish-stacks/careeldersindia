const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { Emitter } = require('@socket.io/redis-emitter');
const { env } = require('../config/env');
const { logger } = require('../config/logger');
const { createRedisClient } = require('../config/redis');
const { resolveUserFromToken } = require('../middleware/auth');
const { ROLES } = require('../config/constants');
const { rooms, CLIENT_EVENTS } = require('./events');
const { setEmitTarget } = require('./emitter');
const bookingAccess = require('../services/access.service');
const locationService = require('../services/location.service');
const presenceService = require('../services/presence.service');

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: [env.ADMIN_APP_URL, env.CLIENT_APP_URL], credentials: true },
    pingInterval: 20000,
    pingTimeout: 20000,
  });

  const pub = createRedisClient();
  const sub = pub.duplicate();
  io.adapter(createAdapter(pub, sub));
  setEmitTarget(io);

  // Auth: identity comes from JWT only — never from client-supplied room names.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || (socket.handshake.headers.authorization || '').replace('Bearer ', '');
      if (!token) return next(new Error('UNAUTHORIZED'));
      socket.user = await resolveUserFromToken(token);
      return next();
    } catch {
      return next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', async (socket) => {
    const { user } = socket;
    socket.join(rooms.user(user.id));
    if (user.role === ROLES.CUSTOMER) socket.join(rooms.customer(user.id));
    if (user.role === ROLES.ASSISTANT) {
      socket.join(rooms.assistant(user.id));
      await presenceService.markOnline(user.id).catch(() => {});
    }
    if (user.role === ROLES.ADMIN) socket.join(rooms.admin());

    socket.on(CLIENT_EVENTS.BOOKING_SUBSCRIBE, async ({ bookingId } = {}, ack) => {
      try {
        await bookingAccess.assertBookingAccess(user, bookingId);
        socket.join(rooms.booking(bookingId));
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, code: err.code || 'FORBIDDEN' });
      }
    });

    socket.on(CLIENT_EVENTS.BOOKING_UNSUBSCRIBE, ({ bookingId } = {}) => socket.leave(rooms.booking(bookingId)));

    socket.on(CLIENT_EVENTS.LOCATION_UPDATE, async (payload, ack) => {
      if (user.role !== ROLES.ASSISTANT) return ack?.({ ok: false, code: 'FORBIDDEN' });
      try {
        await locationService.recordLocation(user.id, payload);
        return ack?.({ ok: true });
      } catch (err) {
        return ack?.({ ok: false, code: err.code || 'LOCATION_REJECTED', message: err.message });
      }
    });

    socket.on('disconnect', async () => {
      if (user.role !== ROLES.ASSISTANT) return;
      const remaining = await io.in(rooms.assistant(user.id)).fetchSockets().catch(() => []);
      if (!remaining.length) await presenceService.markOffline(user.id).catch(() => {});
    });
  });

  logger.info('Socket.IO ready');
  return io;
}

/** Worker processes emit via Redis without running a socket server. */
function initEmitterOnly() {
  setEmitTarget(new Emitter(createRedisClient()));
}

const getIO = () => io;

module.exports = { initSocket, initEmitterOnly, getIO };
