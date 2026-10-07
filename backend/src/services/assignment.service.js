const { Assistant, Booking, User } = require('../models');
const { ApiError } = require('../utils/ApiError');
const { acquireLock, redis } = require('../config/redis');
const { DateTime, formatLocal } = require('../utils/time');
const { BOOKING_STATUS: S, ASSISTANT_BUSY_STATUSES, ASSISTANT_VERIFICATION: V, OPERATIONAL_TIMEZONE } = require('../config/constants');
const sm = require('./bookingStateMachine');
const notifications = require('./notification.service');
const locationService = require('./location.service');
const { broadcastBooking } = require('./bookingEvents');
const { audit } = require('./audit.service');
const { emitTo } = require('../sockets/emitter');
const { rooms, SOCKET_EVENTS } = require('../sockets/events');

const TRAVEL_BUFFER_MIN = 30;
// Hard blocks can never be overridden (patient safety). Soft blocks can, with a reason.
const HARD_REASONS = ['NOT_VERIFIED', 'ACCOUNT_INACTIVE'];

function withinWorkingHours(workingHours, scheduledAt, endsAt) {
  if (!workingHours?.length) return true;
  const start = DateTime.fromJSDate(scheduledAt, { zone: OPERATIONAL_TIMEZONE });
  const end = DateTime.fromJSDate(endsAt, { zone: OPERATIONAL_TIMEZONE });
  const day = start.weekday % 7; // luxon: Mon=1..Sun=7 → Sun=0
  const s = start.toFormat('HH:mm');
  const e = end.toFormat('HH:mm');
  return workingHours.some((w) => w.day === day && w.start <= s && w.end >= e);
}

function servesArea(serviceAreas, address) {
  if (!serviceAreas?.length) return false;
  const city = (address?.city || '').trim().toLowerCase();
  return serviceAreas.some((a) => a.city?.trim().toLowerCase() === city && (!a.pincodes?.length || a.pincodes.includes(address.pincode)));
}

async function evaluate(booking, profile, user) {
  const reasons = [];
  if (profile.verificationStatus !== V.APPROVED) reasons.push('NOT_VERIFIED');
  if (!user || user.status !== 'ACTIVE') reasons.push('ACCOUNT_INACTIVE');
  if (!profile.isAvailable) reasons.push('MARKED_UNAVAILABLE');
  if (!servesArea(profile.serviceAreas, booking.addressSnapshot)) reasons.push('OUTSIDE_SERVICE_AREA');
  if (profile.serviceIds?.length && !profile.serviceIds.some((id) => String(id) === String(booking.serviceId))) reasons.push('SERVICE_NOT_SUPPORTED');
  if (!withinWorkingHours(profile.workingHours, booking.scheduledAt, booking.endsAt)) reasons.push('OUTSIDE_WORKING_HOURS');

  const clash = await Booking.findOne({
    _id: { $ne: booking._id },
    assistantId: profile.userId,
    status: { $in: ASSISTANT_BUSY_STATUSES },
    scheduledAt: { $lt: new Date(booking.endsAt.getTime() + TRAVEL_BUFFER_MIN * 60000) },
    endsAt: { $gt: new Date(booking.scheduledAt.getTime() - TRAVEL_BUFFER_MIN * 60000) },
  })
    .select('bookingNumber')
    .lean();
  if (clash) reasons.push('SLOT_CONFLICT');
  return { reasons, clash: clash?.bookingNumber };
}

async function eligibleAssistants(bookingId, { includeIneligible = true } = {}) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  const profiles = await Assistant.find({ verificationStatus: { $in: [V.APPROVED] } }).lean();
  const users = await User.find({ _id: { $in: profiles.map((p) => p.userId) } }).select('name mobile status').lean();
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const dayStart = DateTime.fromJSDate(booking.scheduledAt, { zone: OPERATIONAL_TIMEZONE }).startOf('day');
  const workload = await Booking.aggregate([
    { $match: { assistantId: { $in: profiles.map((p) => p.userId) }, status: { $in: ASSISTANT_BUSY_STATUSES }, scheduledAt: { $gte: dayStart.toJSDate(), $lt: dayStart.plus({ days: 1 }).toJSDate() } } },
    { $group: { _id: '$assistantId', jobs: { $sum: 1 } } },
  ]);
  const loadById = new Map(workload.map((w) => [String(w._id), w.jobs]));
  const latest = profiles.length ? await redis.mget(profiles.map((p) => locationService.keys.assistant(p.userId))) : [];

  const rows = [];
  for (let i = 0; i < profiles.length; i += 1) {
    const p = profiles[i];
    const u = userById.get(String(p.userId));
    const { reasons, clash } = await evaluate(booking, p, u);
    const loc = latest[i] ? JSON.parse(latest[i]) : null;
    rows.push({
      assistantId: p.userId,
      name: u?.name,
      mobile: u?.mobile,
      languages: p.languages,
      experienceYears: p.experienceYears,
      rating: p.rating,
      isOnline: p.isOnline,
      jobsThatDay: loadById.get(String(p.userId)) || 0,
      distanceMeters: loc ? locationService.distanceMeters({ lat: loc.latitude, lng: loc.longitude }, booking.locationSnapshot) : null,
      eligible: reasons.length === 0,
      overridable: reasons.length > 0 && !reasons.some((r) => HARD_REASONS.includes(r)),
      reasons,
      clashWith: clash,
      isCurrent: String(booking.assistantId) === String(p.userId),
    });
  }
  rows.sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.jobsThatDay - b.jobsThatDay || (a.distanceMeters ?? 1e12) - (b.distanceMeters ?? 1e12));
  return includeIneligible ? rows : rows.filter((r) => r.eligible);
}

async function verifyBooking(admin, bookingId, { notes }, req) {
  const booking = await sm.transition(bookingId, S.VERIFIED, { actor: admin, note: notes, set: notes ? { adminNotes: notes } : {} });
  await audit({ actor: admin, action: 'BOOKING_VERIFIED', entityType: 'Booking', entityId: booking._id, metadata: { notes }, req });
  await notifications.notify({ userIds: booking.customerId, type: notifications.TYPES.BOOKING_VERIFIED, title: 'Visit verified', body: `We are assigning a care assistant for ${booking.parentSnapshot.fullName}'s visit.`, data: { bookingId: String(booking._id) } });
  broadcastBooking(booking, SOCKET_EVENTS.BOOKING_VERIFIED);
  return booking;
}

const ASSIGNABLE_FROM = [S.VERIFIED, S.ASSISTANT_REJECTED, S.ASSISTANT_ASSIGNED, S.ASSISTANT_ACCEPTED, S.ON_THE_WAY];

async function assign(admin, bookingId, { assistantId, override = false, overrideReason }, req) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  if (!ASSIGNABLE_FROM.includes(booking.status)) throw ApiError.conflict(`Cannot assign while booking is ${booking.status}`, 'NOT_ASSIGNABLE');
  if (String(booking.assistantId) === String(assistantId) && booking.status !== S.ASSISTANT_REJECTED) throw ApiError.conflict('Assistant is already assigned', 'ALREADY_ASSIGNED');

  const [profile, user] = await Promise.all([Assistant.findOne({ userId: assistantId }).lean(), User.findById(assistantId).select('name status role').lean()]);
  if (!profile || user?.role !== 'ASSISTANT') throw ApiError.notFound('Assistant not found', 'ASSISTANT_NOT_FOUND');

  const release = await acquireLock(`assign:${assistantId}`, 15000);
  if (!release) throw ApiError.conflict('This assistant is being assigned right now. Try again in a moment.', 'ASSIGNMENT_LOCKED');
  try {
    const { reasons } = await evaluate(booking, profile, user);
    const hard = reasons.filter((r) => HARD_REASONS.includes(r));
    if (hard.length) throw ApiError.conflict(`Assistant cannot be assigned: ${hard.join(', ')}`, 'ASSISTANT_INELIGIBLE', { reasons });
    if (reasons.length && !override) throw ApiError.conflict(`Assistant is not eligible: ${reasons.join(', ')}. Override with a reason to continue.`, 'ASSISTANT_INELIGIBLE', { reasons, overridable: true });
    if (reasons.length && override && !overrideReason) throw ApiError.badRequest('Override reason is required', 'OVERRIDE_REASON_REQUIRED');

    const previous = booking.assistantId;
    const history = (booking.assignment?.history || []).map((h) => {
      const row = h.toObject ? h.toObject() : { ...h };
      return row.outcome === 'PENDING' || row.outcome === 'ACCEPTED' ? { ...row, outcome: 'REASSIGNED' } : row;
    });
    history.push({ assistantId, assignedBy: admin.id, assignedAt: new Date(), outcome: 'PENDING', reason: override ? overrideReason : undefined });

    const updated = await sm.transition(booking._id, S.ASSISTANT_ASSIGNED, {
      actor: admin,
      note: previous ? 'Reassigned' : 'Assigned',
      expectedFrom: booking.status,
      set: {
        assistantId,
        'assignment.assignedAt': new Date(),
        'assignment.assignedBy': admin.id,
        'assignment.acceptedAt': null,
        'assignment.override': Boolean(reasons.length && override),
        'assignment.overrideReason': reasons.length ? overrideReason : undefined,
        'assignment.history': history,
      },
    });

    await audit({ actor: admin, action: previous ? 'ASSISTANT_REASSIGNED' : 'ASSISTANT_ASSIGNED', entityType: 'Booking', entityId: booking._id, metadata: { assistantId, previous, override: Boolean(reasons.length), reasons, overrideReason }, req });

    if (previous && String(previous) !== String(assistantId)) {
      await locationService.stopTracking(booking._id, previous);
      await notifications.notify({ userIds: previous, type: notifications.TYPES.JOB_CANCELLED, title: 'Job reassigned', body: `${updated.bookingNumber} has been reassigned.`, data: { bookingId: String(updated._id) } });
      emitTo(rooms.assistant(String(previous)), SOCKET_EVENTS.JOB_CANCELLED, { bookingId: String(updated._id) });
    }

    const when = formatLocal(updated.scheduledAt, updated.timezone);
    // Socket (instant, if app is open) + FCM (if backgrounded)
    emitTo(rooms.assistant(String(assistantId)), SOCKET_EVENTS.JOB_ASSIGNED, {
      bookingId: String(updated._id),
      patientName: updated.parentSnapshot.fullName,
      serviceName: updated.serviceSnapshot.name,
      scheduledAt: updated.scheduledAt,
      scheduledLocal: updated.scheduledLocal,
      area: `${updated.addressSnapshot.city} ${updated.addressSnapshot.pincode}`,
    });
    await notifications.notify({ userIds: assistantId, type: notifications.TYPES.NEW_JOB, title: 'New health visit', body: `${updated.parentSnapshot.fullName} · ${updated.serviceSnapshot.name} · ${when}`, data: { bookingId: String(updated._id) } });
    await notifications.notify({ userIds: updated.customerId, type: notifications.TYPES.ASSISTANT_ASSIGNED, title: 'Care assistant assigned', body: `${user.name} will visit ${updated.parentSnapshot.fullName} on ${when}.`, data: { bookingId: String(updated._id) } });
    broadcastBooking(updated, SOCKET_EVENTS.ASSISTANT_ASSIGNED, { assistant: { id: String(assistantId), name: user.name } });
    return updated;
  } finally {
    await release();
  }
}

module.exports = { eligibleAssistants, verifyBooking, assign, evaluate, withinWorkingHours, servesArea };
