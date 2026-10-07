const { DateTime } = require('luxon');
const { RecurringPlan, Booking, Parent } = require('../models');
const { nextNumber } = require('../models/Counter');
const { ApiError } = require('../utils/ApiError');
const { localToUtc } = require('../utils/time');
const { parsePagination, pageMeta } = require('../utils/pagination');
const { env } = require('../config/env');
const { logger } = require('../config/logger');
const { acquireLock } = require('../config/redis');
const { FAMILY_PERMISSIONS, BOOKING_STATUS: S, ROLES, OPERATIONAL_TIMEZONE } = require('../config/constants');
const access = require('./access.service');
const catalog = require('./catalog.service');
const bookingService = require('./booking.service');
const notifications = require('./notification.service');
const { audit } = require('./audit.service');

/** Deterministic: occurrence N is always the same instant → generation is idempotent. */
function occurrenceDT(plan, index) {
  const rb = plan.rebase && plan.rebase.startDate ? plan.rebase : null; // schedule changed mid-plan
  const i = rb ? Math.max(0, index - rb.index) : index;
  const first = DateTime.fromISO(`${rb ? rb.startDate : plan.startDate}T${plan.timeOfDay}`, { zone: plan.timezone || OPERATIONAL_TIMEZONE });
  switch (plan.frequency) {
    case 'DAILY':
      return first.plus({ days: i });
    case 'WEEKLY':
      return first.plus({ weeks: i });
    case 'BIWEEKLY':
      return first.plus({ weeks: 2 * i });
    case 'MONTHLY':
      return first.plus({ months: i }); // luxon clamps 31st → month end
    case 'CUSTOM':
      return first.plus({ days: plan.intervalDays * i });
    default:
      throw new Error(`Unknown frequency ${plan.frequency}`);
  }
}
const occurrenceAt = (plan, index) => occurrenceDT(plan, index).toUTC().toJSDate();
const localDate = (plan, index) => occurrenceDT(plan, index).toISODate();

/** How many visits fall between startDate and endDate (inclusive) for a given cadence. */
function countVisits({ startDate, endDate, time, timezone, frequency, intervalDays }) {
  const probe = { startDate, timeOfDay: time, timezone, frequency, intervalDays: frequency === 'DAILY' ? 1 : intervalDays };
  let n = 0;
  while (n < 400 && occurrenceDT(probe, n).toISODate() <= endDate) n += 1;
  return n;
}

function previewSchedule(plan, count = 6) {
  return Array.from({ length: Math.min(count, plan.totalVisits) }, (_, i) => occurrenceAt(plan, i));
}

async function createPlan(user, input, req) {
  const { parent } = await access.assertParentAccess(user, input.parentId, FAMILY_PERMISSIONS.BOOK);
  const service = await catalog.getById(input.serviceId);
  if (input.frequency === 'CUSTOM' && !input.intervalDays) throw ApiError.badRequest('intervalDays is required for custom frequency', 'INTERVAL_REQUIRED');

  const timezone = parent.timezone || OPERATIONAL_TIMEZONE;
  const firstAt = localToUtc(input.startDate, input.time, timezone);
  bookingService.assertSlot(firstAt, input.time);

  const price = catalog.priceFor(service, { recurring: true });
  const plan = await RecurringPlan.create({
    planNumber: await nextNumber('RP'),
    customerId: user.id,
    parentId: parent._id,
    serviceId: service._id,
    frequency: input.frequency,
    intervalDays: input.frequency === 'CUSTOM' ? input.intervalDays : undefined,
    startDate: input.startDate,
    timeOfDay: input.time,
    timezone,
    totalVisits: input.totalVisits,
    pricePerVisit: price.amount,
    totalAmount: price.amount * input.totalVisits,
    currency: price.currency,
    nextOccurrenceAt: firstAt,
    notes: input.notes,
  });
  await audit({ actor: user, action: 'RECURRING_PLAN_CREATED', entityType: 'RecurringPlan', entityId: plan._id, metadata: { planNumber: plan.planNumber }, req });
  return { plan, schedulePreview: previewSchedule(plan), discountPerVisit: price.discount };
}

async function activateAfterPayment(planId, paymentId) {
  const plan = await RecurringPlan.findOneAndUpdate({ _id: planId, status: 'PENDING_PAYMENT' }, { status: 'ACTIVE', paymentId }, { new: true });
  if (!plan) return null;
  await notifications.notify({
    userIds: plan.customerId,
    type: notifications.TYPES.BOOKING_CONFIRMED,
    title: 'Care plan active',
    body: `Plan ${plan.planNumber} is active. Upcoming visits will appear in your bookings.`,
    data: { recurringPlanId: String(plan._id) },
  });
  await generateForPlan(plan);
  return plan;
}

/** Admin-sold plans can pin one assistant: verify + assign each visit automatically. Never blocks generation. */
async function autoAssign(plan, booking) {
  if (!plan.preferredAssistantId || !plan.createdByAdmin) return;
  const actor = { id: String(plan.createdByAdmin), role: ROLES.ADMIN, isSuper: true };
  const assignment = require('./assignment.service');
  try {
    await assignment.verifyBooking(actor, booking._id, { notes: 'Auto-verified (admin plan)' }, null);
    await assignment.assign(actor, booking._id, { assistantId: String(plan.preferredAssistantId), override: true, overrideReason: 'Plan assistant' }, null);
  } catch (err) {
    logger.warn({ bookingId: String(booking._id), err: err.message }, 'Auto-assign failed — assign manually');
  }
}

const EXPIRY_ALERT_DAYS = 3;
const planEndsAt = (plan) => occurrenceAt(plan, plan.totalVisits - 1);

/** Plans (any status) whose last visit is within `days` days — shown as a banner in the customer app. */
async function expiringForCustomer(customerId, days = 7) {
  const plans = await RecurringPlan.find({ customerId, status: { $in: ['ACTIVE', 'COMPLETED', 'PAUSED'] } }).populate('parentId', 'fullName').lean();
  const now = Date.now();
  return plans
    .map((p) => ({ p, end: planEndsAt(p) }))
    .filter(({ end }) => end.getTime() >= now - 86400000 && end.getTime() <= now + days * 86400000)
    .map(({ p, end }) => ({ _id: p._id, planNumber: p.planNumber, parentName: p.parentId?.fullName, endsAt: end, daysLeft: Math.max(0, Math.ceil((end.getTime() - now) / 86400000)) }));
}

/** Scheduler job: tell the customer (and admins) before a plan ends, and again when it has ended. */
async function sendExpiryAlerts() {
  const plans = await RecurringPlan.find({ status: { $in: ['ACTIVE', 'COMPLETED'] }, 'alerts.ended': { $exists: false } }).populate('parentId', 'fullName').limit(500);
  const now = Date.now();
  let sent = 0;
  for (const plan of plans) {
    const end = planEndsAt(plan).getTime();
    const who = plan.parentId?.fullName || 'your family member';
    const ended = end < now;
    const soon = !ended && end - now <= EXPIRY_ALERT_DAYS * 86400000;
    const field = ended ? 'alerts.ended' : soon ? 'alerts.expiring' : null;
    if (!field) continue;
    const claimed = await RecurringPlan.updateOne({ _id: plan._id, [field]: { $exists: false } }, { $set: { [field]: new Date() } });
    if (!claimed.modifiedCount) continue;
    const title = ended ? 'Care plan ended' : 'Care plan ending soon';
    const body = ended ? `Plan ${plan.planNumber} for ${who} has ended. Contact the care desk to renew.` : `Plan ${plan.planNumber} for ${who} ends on ${new Date(end).toISOString().slice(0, 10)}. Contact the care desk to renew.`;
    await notifications.notify({ userIds: plan.customerId, type: ended ? 'PLAN_ENDED' : 'PLAN_EXPIRING', title, body, data: { recurringPlanId: String(plan._id) } });
    await notifications.notifyAdmins({ type: 'PLAN_EXPIRING', title, body: `${body} (customer notified)`, data: { recurringPlanId: String(plan._id) }, push: false });
    sent += 1;
  }
  return sent;
}

/** Materialise bookings inside the rolling horizon. Safe to call repeatedly. */
async function generateForPlan(planDoc) {
  const release = await acquireLock(`plan-gen:${planDoc._id}`, 60000);
  if (!release) return 0;
  let created = 0;
  try {
    const plan = await RecurringPlan.findById(planDoc._id);
    if (!plan || plan.status !== 'ACTIVE') return 0;
    const [parent, service] = await Promise.all([Parent.findById(plan.parentId), catalog.getById(plan.serviceId, { activeOnly: false })]);
    if (!parent || parent.status !== 'ACTIVE') {
      logger.warn({ planId: String(plan._id) }, 'Recurring plan parent missing/archived — pausing');
      plan.status = 'PAUSED';
      await plan.save();
      return 0;
    }
    const horizon = Date.now() + env.RECURRING_HORIZON_DAYS * 86400000;

    while (plan.generatedCount < plan.totalVisits) {
      const idx = plan.generatedCount;
      const at = occurrenceAt(plan, idx);
      if (at.getTime() > horizon) break;
      if (at.getTime() > Date.now()) {
        try {
          const booking = await bookingService.createFromPlanOccurrence(plan, parent, service, idx, at);
          created += 1;
          await autoAssign(plan, booking);
        } catch (err) {
          if (err.code !== 11000) throw err; // already generated → idempotent skip
        }
      } else {
        logger.warn({ planId: String(plan._id), idx }, 'Occurrence already in the past — skipped (will be credited on cancel)');
      }
      plan.generatedCount = idx + 1;
    }
    plan.nextOccurrenceAt = plan.generatedCount < plan.totalVisits ? occurrenceAt(plan, plan.generatedCount) : undefined;
    if (plan.generatedCount >= plan.totalVisits) plan.status = 'COMPLETED';
    await plan.save();
  } finally {
    await release();
  }
  return created;
}

async function generateAllDue() {
  const horizon = new Date(Date.now() + env.RECURRING_HORIZON_DAYS * 86400000);
  const plans = await RecurringPlan.find({ status: 'ACTIVE', nextOccurrenceAt: { $lte: horizon } }).select('_id').limit(500).lean();
  let total = 0;
  for (const p of plans) {
    try {
      total += await generateForPlan(p);
    } catch (err) {
      logger.error({ err, planId: String(p._id) }, 'Recurring generation failed');
    }
  }
  return total;
}

async function assertPlanAccess(user, planId) {
  const plan = await RecurringPlan.findById(planId).populate('serviceId', 'name').populate('parentId', 'fullName');
  if (!plan) throw ApiError.notFound('Plan not found', 'PLAN_NOT_FOUND');
  if (user.role === ROLES.ADMIN) return plan;
  if (String(plan.customerId) === user.id) return plan;
  const m = await access.getMembership(user.id, plan.parentId._id || plan.parentId);
  if (m?.permissions.includes(FAMILY_PERMISSIONS.VIEW)) return plan;
  throw ApiError.notFound('Plan not found', 'PLAN_NOT_FOUND');
}

async function list(user, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (user.role === ROLES.CUSTOMER) {
    const parentIds = await access.accessibleParentIds(user.id);
    filter.$or = [{ customerId: user.id }, { parentId: { $in: parentIds } }];
  }
  if (query.status) filter.status = query.status;
  if (user.role === ROLES.ADMIN) {
    if (query.customerId) filter.customerId = query.customerId;
    if (query.parentId) filter.parentId = query.parentId;
    if (query.frequency) filter.frequency = query.frequency;
    if (query.q) filter.planNumber = new RegExp(String(query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 60), 'i');
  }
  const [items, total] = await Promise.all([
    RecurringPlan.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('serviceId', 'name').populate('parentId', 'fullName').populate('customerId', 'name email'),
    RecurringPlan.countDocuments(filter),
  ]);
  return { items, meta: pageMeta({ page, limit }, total) };
}

async function get(user, planId) {
  const plan = await assertPlanAccess(user, planId);
  const bookings = await Booking.find({ recurringPlanId: plan._id }).sort({ scheduledAt: 1 }).select('bookingNumber scheduledAt scheduledLocal status occurrenceIndex').lean();
  return { plan, bookings, schedulePreview: previewSchedule(plan, plan.totalVisits) };
}

async function setPaused(user, planId, paused, req) {
  const plan = await assertPlanAccess(user, planId);
  if (user.role === ROLES.CUSTOMER && String(plan.customerId) !== user.id) throw ApiError.forbidden();
  const from = paused ? 'ACTIVE' : 'PAUSED';
  if (plan.status !== from) throw ApiError.conflict(`Plan is ${plan.status}`, 'PLAN_STATE');
  plan.status = paused ? 'PAUSED' : 'ACTIVE';
  await plan.save();
  await audit({ actor: user, action: paused ? 'RECURRING_PLAN_PAUSED' : 'RECURRING_PLAN_RESUMED', entityType: 'RecurringPlan', entityId: plan._id, req });
  if (!paused) await generateForPlan(plan);
  return plan;
}

/** Cancel plan: cancels future not-yet-started visits and refunds unused visits. */
async function cancelPlan(user, planId, { reason }, req) {
  const plan = await assertPlanAccess(user, planId);
  if (user.role === ROLES.CUSTOMER && String(plan.customerId) !== user.id) throw ApiError.forbidden('Only the plan owner can cancel it', 'OWNER_ONLY');
  if (['CANCELLED'].includes(plan.status)) throw ApiError.conflict('Plan already cancelled', 'PLAN_STATE');
  const wasPaid = plan.status !== 'PENDING_PAYMENT';

  const cancellableStatuses = [S.PENDING_ADMIN_VERIFICATION, S.VERIFIED, S.ASSISTANT_ASSIGNED, S.ASSISTANT_REJECTED, S.ASSISTANT_ACCEPTED];
  const future = await Booking.find({ recurringPlanId: plan._id, status: { $in: cancellableStatuses }, scheduledAt: { $gt: new Date() } }).select('_id');
  const target = user.role === ROLES.ADMIN ? S.CANCELLED_BY_ADMIN : S.CANCELLED_BY_CUSTOMER;
  const sm = require('./bookingStateMachine');
  let cancelledVisits = 0;
  for (const b of future) {
    try {
      await sm.transition(b._id, target, { actor: user, note: `Plan cancelled: ${reason || ''}`, set: { cancellation: { by: user.id, role: user.role, reason: 'Plan cancelled', at: new Date() } } });
      cancelledVisits += 1;
    } catch (err) {
      logger.warn({ err: err.message, bookingId: String(b._id) }, 'Could not cancel plan booking');
    }
  }
  const unusedVisits = cancelledVisits + (plan.totalVisits - plan.generatedCount);
  plan.status = 'CANCELLED';
  plan.cancellation = { by: user.id, reason, at: new Date() };
  await plan.save();

  let refund = null;
  if (wasPaid && plan.paymentId && unusedVisits > 0) {
    const paymentService = require('./payment.service');
    refund = await paymentService
      .refundPayment(plan.paymentId, { amount: unusedVisits * plan.pricePerVisit, reason: `Plan ${plan.planNumber} cancelled (${unusedVisits} unused visits)`, actor: user })
      .catch((err) => ({ error: err.message }));
  }
  await audit({ actor: user, action: 'RECURRING_PLAN_CANCELLED', entityType: 'RecurringPlan', entityId: plan._id, metadata: { cancelledVisits, unusedVisits, reason }, req });
  return { plan, cancelledVisits, unusedVisits, refund };
}


const UNSTARTED = [S.PENDING_ADMIN_VERIFICATION, S.VERIFIED, S.ASSISTANT_ASSIGNED, S.ASSISTANT_REJECTED, S.ASSISTANT_ACCEPTED];
const endDateOf = (plan) => plan.endDate || localDate(plan, plan.totalVisits - 1);

/**
 * Admin edits a plan after it was sold: cadence, end date / visit count, visit time, pinned assistant, price, services, notes.
 * Future visits that have not started are rebuilt on the new schedule; started/finished visits are never touched.
 */
async function adminUpdatePlan(admin, planId, input, req) {
  const plan = await RecurringPlan.findById(planId);
  if (!plan) throw ApiError.notFound('Plan not found', 'PLAN_NOT_FOUND');
  if (plan.status === 'CANCELLED') throw ApiError.conflict('A cancelled plan cannot be modified', 'PLAN_STATE');
  const tz = plan.timezone || OPERATIONAL_TIMEZONE;
  const today = DateTime.now().setZone(tz).startOf('day');

  if (input.notes !== undefined) plan.notes = input.notes;
  if (input.pricePerVisit !== undefined) plan.pricePerVisit = input.pricePerVisit;
  if (input.assistantId !== undefined) plan.preferredAssistantId = input.assistantId || undefined;
  if (input.sheets?.length) {
    await Promise.all(input.sheets.map((x) => catalog.getById(x.serviceId, { activeOnly: false })));
    plan.sheets = input.sheets.map((x) => ({ serviceId: x.serviceId, itemKeys: x.itemKeys }));
    plan.serviceId = input.sheets[0].serviceId;
  }
  const scheduleChanged = ['frequency', 'intervalDays', 'time', 'endDate', 'totalVisits', 'fromDate'].some((k) => input[k] !== undefined);
  const visitsChanged = scheduleChanged || input.assistantId !== undefined || input.pricePerVisit !== undefined || !!input.sheets?.length;
  if (!visitsChanged) {
    await plan.save();
    await audit({ actor: admin, action: 'ADMIN_PLAN_UPDATED', entityType: 'RecurringPlan', entityId: plan._id, metadata: { fields: Object.keys(input) }, req });
    return plan;
  }

  if (input.fromDate && DateTime.fromISO(input.fromDate, { zone: tz }) < today) throw ApiError.badRequest('Change date cannot be in the past', 'DATE_PAST');
  const cutoff = input.fromDate ? DateTime.fromISO(input.fromDate, { zone: tz }).startOf('day').toJSDate() : scheduleChanged ? today.plus({ days: 1 }).toJSDate() : new Date();
  const oldEnd = endDateOf(plan);
  const future = await Booking.find({ recurringPlanId: plan._id, status: { $in: UNSTARTED }, scheduledAt: { $gte: cutoff } }).select('_id scheduledAt').sort({ scheduledAt: 1 }).lean();
  const rebuildFrom = input.fromDate || (scheduleChanged ? today.plus({ days: 1 }).toISODate() : future[0] ? DateTime.fromJSDate(future[0].scheduledAt, { zone: tz }).toISODate() : null);

  if (rebuildFrom) {
    if (future.length) {
      const ids = future.map((b) => b._id);
      await require('../models').HealthVisit.deleteMany({ bookingId: { $in: ids } });
      await Booking.deleteMany({ _id: { $in: ids } });
    }
    const last = await Booking.findOne({ recurringPlanId: plan._id }).sort({ occurrenceIndex: -1 }).select('occurrenceIndex').lean();
    const nextIdx = last ? last.occurrenceIndex + 1 : 0;
    if (input.frequency) plan.frequency = input.frequency;
    if (input.intervalDays !== undefined) plan.intervalDays = input.intervalDays;
    if (plan.frequency !== 'CUSTOM') plan.intervalDays = undefined;
    if (plan.frequency === 'CUSTOM' && !plan.intervalDays) throw ApiError.badRequest('Days between visits is required', 'INTERVAL_REQUIRED');
    if (input.time) plan.timeOfDay = input.time;
    const cadence = { startDate: rebuildFrom, time: plan.timeOfDay, timezone: tz, frequency: plan.frequency, intervalDays: plan.intervalDays };
    let remaining;
    if (input.endDate) remaining = countVisits({ ...cadence, endDate: input.endDate });
    else if (input.totalVisits !== undefined) remaining = input.totalVisits - nextIdx;
    else remaining = countVisits({ ...cadence, endDate: oldEnd });
    if (remaining < 1) throw ApiError.badRequest('Nothing left to schedule — end date / total visits is before the change date', 'RANGE_EMPTY');
    plan.rebase = { index: nextIdx, startDate: rebuildFrom };
    plan.totalVisits = Math.min(400, nextIdx + remaining);
    plan.generatedCount = nextIdx;
    plan.endDate = localDate(plan, plan.totalVisits - 1);
    plan.nextOccurrenceAt = occurrenceAt(plan, nextIdx);
    plan.alerts = {};
    if (plan.status === 'COMPLETED') plan.status = 'ACTIVE';
  }
  plan.totalAmount = plan.pricePerVisit * plan.totalVisits;
  await plan.save();
  await audit({ actor: admin, action: 'ADMIN_PLAN_UPDATED', entityType: 'RecurringPlan', entityId: plan._id, metadata: { fields: Object.keys(input), rebuiltVisits: future.length }, req });
  await notifications.notify({ userIds: plan.customerId, type: notifications.TYPES.BOOKING_CONFIRMED, title: 'Care plan updated', body: `Plan ${plan.planNumber} was updated by the care desk. It now runs until ${plan.endDate}.`, data: { recurringPlanId: String(plan._id) } }).catch(() => {});
  if (plan.status === 'ACTIVE') await generateForPlan(plan);
  return RecurringPlan.findById(plan._id);
}

/**
 * Renew = a new plan that continues straight after the old one.
 * Customer: created as PENDING_PAYMENT (they pay in the app). Admin: active immediately (offline payment).
 */
async function renewPlan(user, planId, input = {}, req) {
  const old = await RecurringPlan.findById(planId);
  if (!old) throw ApiError.notFound('Plan not found', 'PLAN_NOT_FOUND');
  const isAdmin = user.role === ROLES.ADMIN;
  if (!isAdmin && String(old.customerId) !== user.id) throw ApiError.notFound('Plan not found', 'PLAN_NOT_FOUND');
  if (old.status === 'CANCELLED' || old.status === 'PENDING_PAYMENT') throw ApiError.conflict(`A ${old.status === 'CANCELLED' ? 'cancelled' : 'unpaid'} plan cannot be renewed`, 'PLAN_STATE');

  const pending = await RecurringPlan.findOne({ renewedFromId: old._id, status: 'PENDING_PAYMENT' });
  if (pending && !isAdmin) return { plan: pending, existing: true };
  if (await RecurringPlan.exists({ renewedFromId: old._id, status: { $in: ['ACTIVE', 'PAUSED'] } })) throw ApiError.conflict('This plan has already been renewed', 'ALREADY_RENEWED');

  const tz = old.timezone || OPERATIONAL_TIMEZONE;
  const tomorrow = DateTime.now().setZone(tz).startOf('day').plus({ days: 1 });
  const afterOld = DateTime.fromISO(endDateOf(old), { zone: tz }).plus({ days: 1 });
  const startDate = input.startDate || (afterOld > tomorrow ? afterOld : tomorrow).toISODate();
  if (DateTime.fromISO(startDate, { zone: tz }) < tomorrow.minus({ days: 1 })) throw ApiError.badRequest('Start date cannot be in the past', 'DATE_PAST');
  const frequency = input.frequency || old.frequency;
  const intervalDays = frequency === 'CUSTOM' ? input.intervalDays || old.intervalDays || 1 : undefined;
  const time = input.time || old.timeOfDay;
  const cadence = { startDate, time, timezone: tz, frequency, intervalDays };

  let totalVisits;
  if (input.endDate) totalVisits = countVisits({ ...cadence, endDate: input.endDate });
  else if (input.totalVisits) totalVisits = input.totalVisits;
  else if (old.endDate && old.startDate) {
    const span = Math.max(0, Math.round(DateTime.fromISO(old.endDate, { zone: tz }).diff(DateTime.fromISO(old.startDate, { zone: tz }), 'days').days));
    totalVisits = countVisits({ ...cadence, endDate: DateTime.fromISO(startDate, { zone: tz }).plus({ days: span }).toISODate() });
  } else totalVisits = old.totalVisits;
  totalVisits = Math.min(400, Math.max(1, totalVisits));

  const pricePerVisit = input.pricePerVisit ?? old.pricePerVisit;
  const plan = await RecurringPlan.create({
    planNumber: await nextNumber('RP'), customerId: old.customerId, parentId: old.parentId, serviceId: old.serviceId, sheets: old.sheets,
    frequency, intervalDays, startDate, timeOfDay: time, timezone: tz, totalVisits, pricePerVisit, totalAmount: pricePerVisit * totalVisits, currency: old.currency,
    status: isAdmin ? 'ACTIVE' : 'PENDING_PAYMENT', preferredAssistantId: input.assistantId || old.preferredAssistantId, createdByAdmin: isAdmin ? user.id : undefined,
    renewedFromId: old._id, notes: input.notes ?? old.notes, nextOccurrenceAt: localToUtc(startDate, time, tz),
  });
  plan.endDate = localDate(plan, totalVisits - 1);
  await plan.save();
  await audit({ actor: user, action: 'RECURRING_PLAN_RENEWED', entityType: 'RecurringPlan', entityId: plan._id, metadata: { from: old.planNumber }, req });
  if (isAdmin) {
    await notifications.notify({ userIds: plan.customerId, type: notifications.TYPES.BOOKING_CONFIRMED, title: 'Care plan renewed', body: `Plan ${plan.planNumber} is active from ${startDate} to ${plan.endDate}.`, data: { recurringPlanId: String(plan._id) } }).catch(() => {});
    await generateForPlan(plan);
  }
  return { plan: await RecurringPlan.findById(plan._id), existing: false };
}

module.exports = { adminUpdatePlan, renewPlan, countVisits, localDate, expiringForCustomer, sendExpiryAlerts, occurrenceAt, previewSchedule, createPlan, activateAfterPayment, generateForPlan, generateAllDue, list, get, setPaused, cancelPlan };
