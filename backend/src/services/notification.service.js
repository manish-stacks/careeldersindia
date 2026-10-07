/**
 * Single entry point for notifications: DB inbox + Socket.IO + FCM push (queued, retried).
 * Controllers/services call notify()/notifyAdmins() — never FCM or sockets directly.
 */
const { Notification, User, FcmToken } = require('../models');
const { getMessaging } = require('../config/firebase');
const { logger } = require('../config/logger');
const { redis } = require('../config/redis');
const { emitTo } = require('../sockets/emitter');
const { rooms, SOCKET_EVENTS } = require('../sockets/events');
const { enqueue, QUEUE_NAMES } = require('../jobs/queues');
const { ROLES } = require('../config/constants');

const TYPES = Object.freeze({
  // customer
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  BOOKING_VERIFIED: 'BOOKING_VERIFIED',
  ASSISTANT_ASSIGNED: 'ASSISTANT_ASSIGNED',
  ASSISTANT_ACCEPTED: 'ASSISTANT_ACCEPTED',
  ASSISTANT_ON_THE_WAY: 'ASSISTANT_ON_THE_WAY',
  ASSISTANT_REACHED: 'ASSISTANT_REACHED',
  VISIT_STARTED: 'VISIT_STARTED',
  VISIT_COMPLETED: 'VISIT_COMPLETED',
  REPORT_READY: 'REPORT_READY',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  BOOKING_RESCHEDULED: 'BOOKING_RESCHEDULED',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  // assistant
  NEW_JOB: 'NEW_JOB',
  JOB_CANCELLED: 'JOB_CANCELLED',
  JOB_RESCHEDULED: 'JOB_RESCHEDULED',
  JOB_REMINDER: 'JOB_REMINDER',
  ADMIN_MESSAGE: 'ADMIN_MESSAGE',
  ACCOUNT_APPROVED: 'ACCOUNT_APPROVED',
  ACCOUNT_REJECTED: 'ACCOUNT_REJECTED',
  // admin
  NEW_BOOKING: 'NEW_BOOKING',
  URGENT_HEALTH_ALERT: 'URGENT_HEALTH_ALERT',
  ASSISTANT_COMPLETED_VISIT: 'ASSISTANT_COMPLETED_VISIT',
  ASSISTANT_SOS: 'ASSISTANT_SOS',
  PAYMENT_ISSUE: 'PAYMENT_ISSUE',
  JOB_REJECTED_BY_ASSISTANT: 'JOB_REJECTED_BY_ASSISTANT',
});

// Stringify data for FCM (values must be strings)
function toFcmData(data = {}) {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));
}

/**
 * @param {{userIds: string[]|string, type: string, title: string, body: string, data?: object, push?: boolean, persist?: boolean}} n
 */
async function notify({ userIds, type, title, body, data = {}, push = true, persist = true }) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String))];
  if (!ids.length) return;

  let docs = [];
  if (persist) {
    docs = await Notification.insertMany(ids.map((userId) => ({ userId, type, title, body, data })));
  }
  ids.forEach((userId, i) => {
    emitTo(rooms.user(userId), SOCKET_EVENTS.NOTIFICATION, {
      notification: { id: docs[i]?._id, type, title, body, data, createdAt: docs[i]?.createdAt || new Date() },
    });
  });

  if (push) {
    const job = { userIds: ids, title, body, data: { ...data, type } };
    const queued = await enqueue(QUEUE_NAMES.PUSH, 'send', job).catch((err) => {
      logger.warn({ err: err.message }, 'Push enqueue failed, sending inline');
      return null;
    });
    if (!queued) await sendPush(job).catch(() => {});
  }
}

async function adminIds() {
  const cached = await redis.get('cache:admin-ids').catch(() => null);
  if (cached) return JSON.parse(cached);
  const admins = await User.find({ role: ROLES.ADMIN, status: 'ACTIVE' }).select('_id').lean();
  const ids = admins.map((a) => String(a._id));
  await redis.set('cache:admin-ids', JSON.stringify(ids), 'EX', 60).catch(() => {});
  return ids;
}

async function notifyAdmins(payload) {
  return notify({ ...payload, userIds: await adminIds() });
}

/** Called by the push worker. Throws on transient failure so BullMQ retries. */
async function sendPush({ userIds, title, body, data }) {
  const messaging = getMessaging();
  const tokens = await FcmToken.find({ userId: { $in: userIds } }).select('token').lean();
  if (!tokens.length) return { sent: 0 };
  if (!messaging) {
    logger.debug({ count: tokens.length, title }, 'FCM not configured — push skipped');
    return { sent: 0, skipped: true };
  }
  const res = await messaging.sendEachForMulticast({
    tokens: tokens.map((t) => t.token),
    notification: { title, body },
    data: toFcmData(data),
    android: { priority: 'high', notification: { channelId: data?.type === 'ASSISTANT_SOS' || data?.type === 'URGENT_HEALTH_ALERT' ? 'urgent' : 'default' } },
    apns: { payload: { aps: { sound: 'default' } } },
  });
  const invalid = [];
  res.responses.forEach((r, i) => {
    const code = r.error?.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') invalid.push(tokens[i].token);
  });
  if (invalid.length) await FcmToken.deleteMany({ token: { $in: invalid } });
  return { sent: res.successCount, failed: res.failureCount, removed: invalid.length };
}

async function registerToken(userId, { token, platform, deviceId, appVersion }) {
  // A device token belongs to exactly one user at a time (handles account switching on same phone)
  return FcmToken.findOneAndUpdate(
    { token },
    { userId, platform, deviceId, appVersion, lastSeenAt: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function unregisterToken(userId, token) {
  await FcmToken.deleteOne({ userId, token });
}

module.exports = { TYPES, notify, notifyAdmins, sendPush, registerToken, unregisterToken, adminIds };
