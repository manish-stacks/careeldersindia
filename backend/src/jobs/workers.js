/** BullMQ workers. Each processor is idempotent — jobs may run more than once. */
const { Worker } = require('bullmq');
const { logger } = require('../config/logger');
const { acquireLock } = require('../config/redis');
const { Booking } = require('../models');
const { BOOKING_STATUS: S } = require('../config/constants');
const { formatLocal } = require('../utils/time');
const { QUEUE_NAMES } = require('./queues');

const REMINDER_ASSISTANT_MIN = 60;
const REMINDER_CUSTOMER_HOURS = 24;

async function sendReminders() {
  const notifications = require('../services/notification.service');
  const now = Date.now();
  let sent = 0;

  // Assistant: ~60 min before, only for accepted jobs
  const assistantDue = await Booking.find({
    status: S.ASSISTANT_ACCEPTED,
    scheduledAt: { $gt: new Date(now), $lte: new Date(now + REMINDER_ASSISTANT_MIN * 60000) },
    'reminders.assistant60m': { $exists: false },
  }).limit(200);
  for (const b of assistantDue) {
    // claim first so parallel workers never double-send
    const claimed = await Booking.updateOne({ _id: b._id, 'reminders.assistant60m': { $exists: false } }, { $set: { 'reminders.assistant60m': new Date() } });
    if (!claimed.modifiedCount) continue;
    await notifications.notify({
      userIds: b.assistantId,
      type: notifications.TYPES.JOB_REMINDER,
      title: 'Visit in 1 hour',
      body: `${b.parentSnapshot.fullName} · ${b.addressSnapshot.city} at ${formatLocal(b.scheduledAt, b.timezone, 'h:mm a')}. Start travel when you leave.`,
      data: { bookingId: String(b._id) },
    });
    sent += 1;0
  }

  // Customer: ~24 h before, for confirmed (paid) upcoming visits
  const customerDue = await Booking.find({
    status: { $in: [S.PENDING_ADMIN_VERIFICATION, S.VERIFIED, S.ASSISTANT_ASSIGNED, S.ASSISTANT_ACCEPTED] },
    scheduledAt: { $gt: new Date(now), $lte: new Date(now + REMINDER_CUSTOMER_HOURS * 3600000) },
    'reminders.customer24h': { $exists: false },
    createdAt: { $lt: new Date(now - 60 * 60000) }, // skip bookings made in the last hour
  }).limit(200);
  for (const b of customerDue) {
    const claimed = await Booking.updateOne({ _id: b._id, 'reminders.customer24h': { $exists: false } }, { $set: { 'reminders.customer24h': new Date() } });
    if (!claimed.modifiedCount) continue;
    await notifications.notify({
      userIds: b.customerId,
      type: 'VISIT_REMINDER',
      title: 'Upcoming visit tomorrow',
      body: `${b.serviceSnapshot.name} for ${b.parentSnapshot.fullName} on ${formatLocal(b.scheduledAt, b.timezone)}.`,
      data: { bookingId: String(b._id) },
    });
    sent += 1;
  }

  // Ops: visits within 2 h that still have no accepted assistant
  const atRisk = await Booking.countDocuments({ status: { $in: [S.PENDING_ADMIN_VERIFICATION, S.VERIFIED, S.ASSISTANT_REJECTED, S.ASSISTANT_ASSIGNED] }, scheduledAt: { $gt: new Date(now), $lte: new Date(now + 2 * 3600000) } });
  if (atRisk && (await acquireLock('at-risk-alert', 30 * 60 * 1000))) {
    await notifications.notifyAdmins({ type: 'VISITS_AT_RISK', title: `${atRisk} visit(s) at risk`, body: 'Visits starting within 2 hours have no confirmed assistant.', data: {}, push: true });
  }
  return { sent, atRisk };
}

/**
 * Trip watchdog: an assistant is ON_THE_WAY but the family's map hasn't moved for 5+ minutes
 * (phone killed the app, GPS off, no network, or iOS app swiped away). Nudge the assistant; tell ops if it persists.
 */
async function watchTrips() {
  const notifications = require('../services/notification.service');
  const { latestForBooking } = require('../services/location.service');
  const now = Date.now();
  const trips = await Booking.find({ status: S.ON_THE_WAY, 'travel.startedAt': { $lt: new Date(now - 3 * 60000) } }).select('assistantId bookingNumber parentSnapshot.fullName travel').limit(500).lean();
  let nudged = 0;
  let escalated = 0;
  for (const b of trips) {
    const last = await latestForBooking(b._id);
    const age = last ? now - new Date(last.timestamp).getTime() : now - new Date(b.travel.startedAt).getTime();
    if (age < 5 * 60000) continue;
    if (await acquireLock(`trip-nudge:${b._id}`, 10 * 60000)) {
      await notifications.notify({
        userIds: b.assistantId,
        type: 'TRIP_LOCATION_PAUSED',
        title: 'Location sharing paused',
        body: `The family can't see you on the way to ${b.parentSnapshot.fullName}. Tap to resume.`,
        data: { bookingId: String(b._id), screen: 'job', resumeTrip: '1' },
      });
      nudged += 1;
    }
    if (age >= 15 * 60000 && (await acquireLock(`trip-escalate:${b._id}`, 30 * 60000))) {
      await notifications.notifyAdmins({ type: 'TRIP_LOCATION_LOST', title: `No location for ${Math.round(age / 60000)} min`, body: `${b.bookingNumber}: assistant is marked on the way but not sharing location.`, data: { bookingId: String(b._id) }, push: true });
      escalated += 1;
    }
  }
  return { trips: trips.length, nudged, escalated };
}

const processors = {
  [QUEUE_NAMES.PUSH]: async (job) => require('../services/notification.service').sendPush(job.data),

  [QUEUE_NAMES.REPORTS]: async (job) => {
    const report = await require('../services/report.service').generatePdf(job.data.reportId);
    return { status: report?.pdf?.status };
  },

  [QUEUE_NAMES.SCHEDULER]: async (job) => {
    // repeatables can overlap across instances → lock per job name
    const ttl = (job.name === 'recurring-generate' ? 50 : job.name === 'trip-watch' ? 1.5 : job.name === 'data-retention' ? 60 : 4) * 60 * 1000;
    if (!(await acquireLock(`scheduler:${job.name}`, ttl))) return { skipped: 'locked' };
    switch (job.name) {
      case 'recurring-generate':
        return { generated: await require('../services/recurring.service').generateAllDue() };
      case 'booking-reminders': {
        const reminders = await sendReminders();
        reminders.planAlerts = await require('../services/recurring.service').sendExpiryAlerts();
        const recovered = await require('../services/healthVisit.service').recoverStuck();
        return { ...reminders, recovered };
      }
      case 'trip-watch': {
        return watchTrips();
      }
      case 'data-retention': {
        // Auto-delete old notifications and audit-log rows (days are configurable via env)
        const { Notification, AuditLog } = require('../models');
        const days = (v, d) => Math.max(1, Number(v) || d);
        const nCut = new Date(Date.now() - days(process.env.NOTIFICATION_RETENTION_DAYS, 30) * 86400000);
        const aCut = new Date(Date.now() - days(process.env.AUDIT_RETENTION_DAYS, 90) * 86400000);
        const [n, a] = await Promise.all([Notification.deleteMany({ createdAt: { $lt: nCut } }), AuditLog.deleteMany({ createdAt: { $lt: aCut } })]);
        return { notifications: n.deletedCount, auditLogs: a.deletedCount };
      }
      case 'stale-payment-cleanup':
        return require('../services/payment.service').expireStalePending();
      default:
        logger.warn({ name: job.name }, 'Unknown scheduler job');
        return null;
    }
  },
};

const CONCURRENCY = { [QUEUE_NAMES.PUSH]: 10, [QUEUE_NAMES.REPORTS]: 2, [QUEUE_NAMES.SCHEDULER]: 1 };

function createWorkers(connection) {
  return Object.entries(processors).map(([name, processor]) => {
    const worker = new Worker(name, processor, { connection, concurrency: CONCURRENCY[name] || 1 });
    worker.on('failed', (job, err) => logger.error({ queue: name, jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'Job failed'));
    worker.on('error', (err) => logger.error({ queue: name, err: err.message }, 'Worker error'));
    return worker;
  });
}

module.exports = {
  watchTrips, createWorkers, sendReminders, processors };
