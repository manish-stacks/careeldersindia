/** Assistant-side job lifecycle: accept → travel → reached → start visit (→ complete in healthVisit.service). */
const { Booking, HealthVisit, Parent, User } = require('../models');
const { ApiError } = require('../utils/ApiError');
const { formatLocal } = require('../utils/time');
const { BOOKING_STATUS: S, ASSISTANT_BUSY_STATUSES } = require('../config/constants');
const sm = require('./bookingStateMachine');
const notifications = require('./notification.service');
const locationService = require('./location.service');
const serializers = require('./serializers');
const { broadcastBooking } = require('./bookingEvents');
const { audit } = require('./audit.service');
const { SOCKET_EVENTS } = require('../sockets/events');

const TRAVEL_WINDOW_HOURS = process.env.NODE_ENV === 'production' ? 3 : 24 * 365;
const ARRIVAL_RADIUS_M = 500;

async function loadAssigned(user, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, assistantId: user.id });
  if (!booking) throw ApiError.notFound('Job not found', 'JOB_NOT_FOUND');
  return booking;
}

function setHistoryOutcome(booking, outcome, reason) {
  const history = (booking.assignment?.history || []).map((h) => (h.toObject ? h.toObject() : { ...h }));
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (String(history[i].assistantId) === String(booking.assistantId) && history[i].outcome === 'PENDING') {
      history[i].outcome = outcome;
      if (reason) history[i].reason = reason;
      break;
    }
  }
  return history;
}

async function getJob(user, bookingId) {
  const booking = await loadAssigned(user, bookingId);
  const job = serializers.forAssistant(booking);
  // The patient's and the customer's live contact details, so the assistant can call before the visit.
  const [parent, customer] = await Promise.all([
    Parent.findById(booking.parentId).select('mobile emergencyContacts').lean(),
    User.findById(booking.customerId).select('name mobile email').lean(),
  ]);
  job.patient.mobile = parent?.mobile || job.patient.mobile;
  job.patient.emergencyContacts = job.patient.emergencyContacts || parent?.emergencyContacts;
  job.customer = customer ? { name: customer.name, mobile: customer.mobile, email: customer.email } : undefined;
  return job;
}

async function accept(user, bookingId, req) {
  const booking = await loadAssigned(user, bookingId);
  const clash = await Booking.findOne({
    _id: { $ne: booking._id },
    assistantId: user.id,
    status: { $in: ASSISTANT_BUSY_STATUSES.filter((s) => s !== S.ASSISTANT_ASSIGNED) },
    scheduledAt: { $lt: booking.endsAt },
    endsAt: { $gt: booking.scheduledAt },
  }).select('bookingNumber');
  if (clash) throw ApiError.conflict(`You already have ${clash.bookingNumber} at this time`, 'SLOT_CONFLICT');

  const updated = await sm.transition(booking._id, S.ASSISTANT_ACCEPTED, {
    actor: user,
    expectedFrom: S.ASSISTANT_ASSIGNED,
    extraFilter: { assistantId: user.id },
    set: { 'assignment.acceptedAt': new Date(), 'assignment.history': setHistoryOutcome(booking, 'ACCEPTED') },
  });
  await audit({ actor: user, action: 'JOB_ACCEPTED', entityType: 'Booking', entityId: booking._id, req });
  await notifications.notify({ userIds: updated.customerId, type: notifications.TYPES.ASSISTANT_ACCEPTED, title: 'Assistant confirmed', body: `${user.name} confirmed the visit on ${formatLocal(updated.scheduledAt, updated.timezone)}.`, data: { bookingId: String(updated._id) } });
  broadcastBooking(updated, SOCKET_EVENTS.JOB_ACCEPTED);
  return serializers.forAssistant(updated);
}

async function reject(user, bookingId, { reason }, req) {
  const booking = await loadAssigned(user, bookingId);
  const updated = await sm.transition(booking._id, S.ASSISTANT_REJECTED, {
    actor: user,
    note: reason,
    expectedFrom: S.ASSISTANT_ASSIGNED,
    extraFilter: { assistantId: user.id },
    set: { 'assignment.history': setHistoryOutcome(booking, 'REJECTED', reason) },
    unset: { assistantId: 1 }, // assistant loses access immediately
  });
  await audit({ actor: user, action: 'JOB_REJECTED', entityType: 'Booking', entityId: booking._id, metadata: { reason }, req });
  await notifications.notifyAdmins({ type: notifications.TYPES.JOB_REJECTED_BY_ASSISTANT, title: 'Job rejected — reassign', body: `${user.name} rejected ${updated.bookingNumber}: ${reason}`, data: { bookingId: String(updated._id) } });
  broadcastBooking(updated, SOCKET_EVENTS.JOB_REJECTED);
  return { bookingId: updated._id, status: updated.status };
}

async function startTravel(user, bookingId, req) {
  const booking = await loadAssigned(user, bookingId);
  const hoursAhead = (booking.scheduledAt.getTime() - Date.now()) / 3600000;
  if (hoursAhead > TRAVEL_WINDOW_HOURS) throw ApiError.conflict(`You can start travelling within ${TRAVEL_WINDOW_HOURS} hours of the visit`, 'TOO_EARLY_TO_TRAVEL');
  const updated = await sm.transition(booking._id, S.ON_THE_WAY, { actor: user, expectedFrom: S.ASSISTANT_ACCEPTED, extraFilter: { assistantId: user.id }, set: { 'travel.startedAt': new Date() } });
  await audit({ actor: user, action: 'TRAVEL_STARTED', entityType: 'Booking', entityId: booking._id, req });
  await notifications.notify({ userIds: updated.customerId, type: notifications.TYPES.ASSISTANT_ON_THE_WAY, title: 'Assistant on the way', body: `${user.name} is on the way to ${updated.parentSnapshot.fullName}. Track live in the app.`, data: { bookingId: String(updated._id) } });
  broadcastBooking(updated, SOCKET_EVENTS.ON_THE_WAY);
  return serializers.forAssistant(updated);
}

async function markReached(user, bookingId, { latitude, longitude } = {}, req) {
  const booking = await loadAssigned(user, bookingId);
  let distance = null;
  if (typeof latitude === 'number' && booking.locationSnapshot?.lat) {
    distance = locationService.distanceMeters({ lat: latitude, lng: longitude }, booking.locationSnapshot);
  }
  const updated = await sm.transition(booking._id, S.REACHED, { actor: user, expectedFrom: S.ON_THE_WAY, extraFilter: { assistantId: user.id }, set: { 'travel.reachedAt': new Date() } });
  await audit({ actor: user, action: 'ASSISTANT_REACHED', entityType: 'Booking', entityId: booking._id, metadata: { distanceFromAddressM: distance, flagged: distance !== null && distance > ARRIVAL_RADIUS_M }, req });
  if (distance !== null && distance > ARRIVAL_RADIUS_M) {
    await notifications.notifyAdmins({ type: 'ARRIVAL_LOCATION_MISMATCH', title: 'Arrival far from address', body: `${updated.bookingNumber}: marked reached ${distance} m from the address`, data: { bookingId: String(updated._id) }, push: false });
  }
  await notifications.notify({ userIds: updated.customerId, type: notifications.TYPES.ASSISTANT_REACHED, title: 'Assistant has arrived', body: `${user.name} has reached ${updated.parentSnapshot.fullName}.`, data: { bookingId: String(updated._id) } });
  broadcastBooking(updated, SOCKET_EVENTS.ASSISTANT_REACHED);
  return serializers.forAssistant(updated);
}

async function startVisit(user, bookingId, req) {
  const booking = await loadAssigned(user, bookingId);
  if (booking.status !== S.REACHED) throw ApiError.conflict('Mark yourself as reached before starting the visit', 'NOT_REACHED');
  // Visit record first (unique on bookingId → idempotent under double tap)
  let visit = await HealthVisit.findOne({ bookingId: booking._id });
  if (!visit) {
    try {
      visit = await HealthVisit.create({ bookingId: booking._id, parentId: booking.parentId, assistantId: user.id, serviceId: booking.serviceId, startedAt: new Date() });
    } catch (err) {
      if (err.code !== 11000) throw err;
      visit = await HealthVisit.findOne({ bookingId: booking._id });
    }
  }
  const updated = await sm.transition(booking._id, S.VISIT_STARTED, { actor: user, expectedFrom: S.REACHED, extraFilter: { assistantId: user.id }, set: { visitId: visit._id } });
  await locationService.stopTracking(booking._id, user.id); // tracking stops once the visit begins
  await audit({ actor: user, action: 'VISIT_STARTED', entityType: 'Booking', entityId: booking._id, metadata: { visitId: String(visit._id) }, req });
  await notifications.notify({ userIds: updated.customerId, type: notifications.TYPES.VISIT_STARTED, title: 'Visit started', body: `${updated.parentSnapshot.fullName}'s health check has started.`, data: { bookingId: String(updated._id) } });
  broadcastBooking(updated, SOCKET_EVENTS.VISIT_STARTED, { visitId: String(visit._id) });
  return { job: serializers.forAssistant(updated), visit };
}

async function markNoShow(user, bookingId, { reason }, req) {
  const booking = await loadAssigned(user, bookingId);
  const updated = await sm.transition(booking._id, S.NO_SHOW, { actor: user, note: reason, expectedFrom: S.REACHED, extraFilter: { assistantId: user.id } });
  await locationService.stopTracking(booking._id, user.id);
  await audit({ actor: user, action: 'VISIT_NO_SHOW', entityType: 'Booking', entityId: booking._id, metadata: { reason }, req });
  await notifications.notify({ userIds: updated.customerId, type: 'VISIT_NO_SHOW', title: 'Visit could not happen', body: `${user.name} could not complete the visit: ${reason}. Our team will contact you.`, data: { bookingId: String(updated._id) } });
  await notifications.notifyAdmins({ type: 'VISIT_NO_SHOW', title: 'No-show reported', body: `${updated.bookingNumber}: ${reason}`, data: { bookingId: String(updated._id) } });
  broadcastBooking(updated, SOCKET_EVENTS.BOOKING_STATUS_CHANGED);
  return serializers.forAssistant(updated);
}

module.exports = { getJob, accept, reject, startTravel, markReached, startVisit, markNoShow };
