const { applySearchAndDates } = require('../utils/listFilters');
const { Booking, Parent, FamilyMember } = require('../models');
const { nextNumber } = require('../models/Counter');
const { ApiError } = require('../utils/ApiError');
const { localToUtc, utcToLocalParts, formatLocal } = require('../utils/time');
const { parsePagination, pageMeta } = require('../utils/pagination');
const { BOOKING_STATUS: S, FAMILY_PERMISSIONS, ROLES, TERMINAL_STATUSES, OPERATIONAL_TIMEZONE } = require('../config/constants');
const sm = require('./bookingStateMachine');
const access = require('./access.service');
const catalog = require('./catalog.service');
const serializers = require('./serializers');
const notifications = require('./notification.service');
const { broadcastBooking } = require('./bookingEvents');
const { audit } = require('./audit.service');
const { SOCKET_EVENTS } = require('../sockets/events');

const MIN_LEAD_MINUTES = 180; // earliest bookable slot from now
const MAX_ADVANCE_DAYS = 120;
const FREE_CANCEL_HOURS = 12; // full refund if cancelled at least this far ahead
const SLOT_START = '07:00';
const SLOT_END = '20:00';

function assertSlot(scheduledAt, time) {
  const now = Date.now();
  if (scheduledAt.getTime() < now + MIN_LEAD_MINUTES * 60000) {
    throw ApiError.badRequest(`Visits must be booked at least ${MIN_LEAD_MINUTES / 60} hours in advance`, 'SLOT_TOO_SOON');
  }
  if (scheduledAt.getTime() > now + MAX_ADVANCE_DAYS * 86400000) {
    throw ApiError.badRequest(`Visits can be booked up to ${MAX_ADVANCE_DAYS} days ahead`, 'SLOT_TOO_FAR');
  }
  if (time < SLOT_START || time > SLOT_END) {
    throw ApiError.badRequest(`Visits run between ${SLOT_START} and ${SLOT_END} India time`, 'SLOT_OUTSIDE_HOURS');
  }
}

function buildSnapshots(parent, service, sheets = []) {
  const coords = parent.location?.coordinates;
  return {
    addressSnapshot: parent.address.toObject ? parent.address.toObject() : parent.address,
    locationSnapshot: coords?.length === 2 ? { lng: coords[0], lat: coords[1] } : undefined,
    parentSnapshot: {
      fullName: parent.fullName,
      gender: parent.gender,
      dateOfBirth: parent.dateOfBirth,
      bloodGroup: parent.bloodGroup,
      mobile: parent.mobile,
      medicalConditions: parent.medicalConditions,
      medicines: parent.medicines.map((m) => ({ name: m.name, dosage: m.dosage, schedule: m.schedule })),
      allergies: parent.allergies,
      emergencyContacts: parent.emergencyContacts,
      specialInstructions: parent.specialInstructions,
    },
    serviceSnapshot: { name: service.name, durationMinutes: service.durationMinutes, fields: service.fields, symptomsList: service.symptomsList, sheets },
  };
}

async function assertNoParentClash(parentId, scheduledAt, endsAt, excludeId) {
  const clash = await Booking.findOne({
    parentId,
    _id: { $ne: excludeId },
    status: { $nin: [...TERMINAL_STATUSES, S.DRAFT] },
    scheduledAt: { $lt: endsAt },
    endsAt: { $gt: scheduledAt },
  }).select('bookingNumber').lean();
  if (clash) throw ApiError.conflict(`This parent already has a visit at that time (${clash.bookingNumber})`, 'PARENT_SLOT_TAKEN');
}

/** One-time booking. Created in PENDING_PAYMENT; confirmed only by the payment webhook/verify. */
async function createOneTime(user, { parentId, serviceId, itemKeys, date, time, customerNotes }, req) {
  const { parent } = await access.assertParentAccess(user, parentId, FAMILY_PERMISSIONS.BOOK);
  const service = await catalog.getById(serviceId);
  const timezone = parent.timezone || OPERATIONAL_TIMEZONE;
  const scheduledAt = localToUtc(date, time, timezone);
  assertSlot(scheduledAt, time);
  const endsAt = new Date(scheduledAt.getTime() + service.durationMinutes * 60000);
  await assertNoParentClash(parent._id, scheduledAt, endsAt);

  const booking = await Booking.create({
    bookingNumber: await nextNumber('BK'),
    customerId: user.id,
    parentId: parent._id,
    serviceId: service._id,
    scheduledAt,
    endsAt,
    timezone,
    scheduledLocal: { date, time },
    durationMinutes: service.durationMinutes,
    status: S.PENDING_PAYMENT,
    statusHistory: [
      { from: null, to: S.DRAFT, actorId: user.id, actorRole: user.role },
      { from: S.DRAFT, to: S.PENDING_PAYMENT, actorId: user.id, actorRole: user.role },
    ],
    price: catalog.priceFor(service),
    customerNotes,
    ...buildSnapshots(parent, service, await catalog.sheetSnapshots([{ serviceId: service._id, itemKeys }])),
  });
  await audit({ actor: user, action: 'BOOKING_CREATED', entityType: 'Booking', entityId: booking._id, metadata: { bookingNumber: booking.bookingNumber }, req });
  return serializers.forCustomer(booking);
}

/** Called by payment service once money is confirmed server-side. */
async function confirmAfterPayment(bookingId, paymentId) {
  const booking = await sm.transition(bookingId, [S.PAYMENT_SUCCESS, S.PENDING_ADMIN_VERIFICATION], {
    actor: 'SYSTEM',
    set: { paymentId, paymentStatus: 'PAID' },
    expectedFrom: S.PENDING_PAYMENT,
  });
  await notifications.notify({
    userIds: booking.customerId,
    type: notifications.TYPES.BOOKING_CONFIRMED,
    title: 'Booking confirmed',
    body: `${booking.parentSnapshot.fullName}'s ${booking.serviceSnapshot.name} on ${formatLocal(booking.scheduledAt, booking.timezone)} is confirmed.`,
    data: { bookingId: String(booking._id) },
  });
  await notifications.notifyAdmins({
    type: notifications.TYPES.NEW_BOOKING,
    title: 'New booking to verify',
    body: `${booking.bookingNumber} · ${booking.serviceSnapshot.name} · ${booking.addressSnapshot.city}`,
    data: { bookingId: String(booking._id) },
  });
  broadcastBooking(booking, SOCKET_EVENTS.BOOKING_CREATED);
  return booking;
}

/** Recurring occurrences are prepaid by the plan and enter the ops queue directly. */
async function createFromPlanOccurrence(plan, parent, service, occurrenceIndex, scheduledAt) {
  const endsAt = new Date(scheduledAt.getTime() + service.durationMinutes * 60000);
  const local = utcToLocalParts(scheduledAt, plan.timezone);
  const booking = await Booking.create({
    bookingNumber: await nextNumber('BK'),
    customerId: plan.customerId,
    parentId: plan.parentId,
    serviceId: plan.serviceId,
    recurringPlanId: plan._id,
    occurrenceIndex,
    scheduledAt,
    endsAt,
    timezone: plan.timezone,
    scheduledLocal: local,
    durationMinutes: service.durationMinutes,
    status: S.PENDING_ADMIN_VERIFICATION,
    statusHistory: [
      { from: null, to: S.PAYMENT_SUCCESS, actorRole: 'SYSTEM', note: `Prepaid by plan ${plan.planNumber}` },
      { from: S.PAYMENT_SUCCESS, to: S.PENDING_ADMIN_VERIFICATION, actorRole: 'SYSTEM' },
    ],
    paymentId: plan.paymentId,
    paymentStatus: 'PREPAID_PLAN',
    price: { amount: plan.pricePerVisit, discount: 0, currency: plan.currency },
    ...buildSnapshots(parent, service, await catalog.sheetSnapshots(plan.sheets?.length ? plan.sheets.map((x) => ({ serviceId: x.serviceId, itemKeys: x.itemKeys })) : [{ serviceId: plan.serviceId }])),
  });
  broadcastBooking(booking, SOCKET_EVENTS.BOOKING_CREATED, { recurringPlanId: String(plan._id) });
  return booking;
}

async function listForCustomer(user, query) {
  const { page, limit, skip } = parsePagination(query);
  const parentIds = await access.accessibleParentIds(user.id, FAMILY_PERMISSIONS.VIEW);
  const filter = { $or: [{ customerId: user.id }, { parentId: { $in: parentIds } }] };
  if (query.parentId) filter.parentId = query.parentId;
  if (query.scope === 'upcoming') {
    filter.status = { $nin: [...TERMINAL_STATUSES, S.DRAFT] };
    filter.endsAt = { $gte: new Date(Date.now() - 6 * 3600000) };
  } else if (query.scope === 'past') {
    filter.$and = [{ $or: [{ status: { $in: TERMINAL_STATUSES } }, { endsAt: { $lt: new Date() } }] }];
  }
  if (query.status) filter.status = query.status;
  applySearchAndDates(filter, query);
  const sort = query.scope === 'upcoming' ? { scheduledAt: 1 } : { scheduledAt: -1 };
  const [items, total] = await Promise.all([
    Booking.find(filter).sort(sort).skip(skip).limit(limit).populate('assistantId', 'name mobile'),
    Booking.countDocuments(filter),
  ]);
  return { items: items.map(serializers.forCustomer), meta: pageMeta({ page, limit }, total) };
}

async function getForUser(user, bookingId) {
  const booking = await access.assertBookingAccess(user, bookingId);
  await booking.populate('assistantId', 'name mobile');
  return serializers.forRole(user.role, booking);
}

async function cancel(user, bookingId, { reason }, req) {
  const booking = await access.assertBookingAccess(user, bookingId);
  const isAdmin = user.role === ROLES.ADMIN;
  if (!isAdmin && user.role !== ROLES.CUSTOMER) throw ApiError.forbidden();
  if (!isAdmin) {
    // Family members need BOOK permission to cancel
    const allowed = String(booking.customerId) === user.id || (await access.getMembership(user.id, booking.parentId))?.permissions.includes(FAMILY_PERMISSIONS.BOOK);
    if (!allowed) throw ApiError.forbidden('You cannot cancel this visit', 'PERMISSION_REQUIRED');
  }
  const target = isAdmin ? S.CANCELLED_BY_ADMIN : S.CANCELLED_BY_CUSTOMER;
  const previousAssistant = booking.assistantId;

  const updated = await sm.transition(booking._id, target, {
    actor: user,
    note: reason,
    set: { cancellation: { by: user.id, role: user.role, reason, at: new Date() } },
  });

  // Refund policy: admin cancel → full; customer cancel ≥ FREE_CANCEL_HOURS ahead → full;
  // later customer cancellations go to ops for manual review (admin refund endpoint).
  const hoursAhead = (updated.scheduledAt.getTime() - Date.now()) / 3600000;
  const fullRefundEligible = isAdmin || hoursAhead >= FREE_CANCEL_HOURS;
  let refund = null;
  if (['PAID', 'PREPAID_PLAN'].includes(updated.paymentStatus) && fullRefundEligible) {
    const paymentService = require('./payment.service');
    refund = await paymentService
      .refundForBooking(updated, { reason: reason || 'Booking cancelled', actor: user })
      .catch((err) => ({ error: err.message }));
  }

  await audit({ actor: user, action: 'BOOKING_CANCELLED', entityType: 'Booking', entityId: booking._id, metadata: { reason, refund: refund && !refund.error ? refund.amount : null }, req });

  await notifications.notify({
    userIds: updated.customerId,
    type: notifications.TYPES.BOOKING_CANCELLED,
    title: 'Visit cancelled',
    body: `${updated.bookingNumber} has been cancelled.${refund && !refund.error ? ' A refund has been initiated.' : ''}`,
    data: { bookingId: String(updated._id) },
  });
  if (previousAssistant) {
    await notifications.notify({ userIds: previousAssistant, type: notifications.TYPES.JOB_CANCELLED, title: 'Job cancelled', body: `${updated.bookingNumber} on ${formatLocal(updated.scheduledAt)} was cancelled.`, data: { bookingId: String(updated._id) } });
  }
  broadcastBooking(updated, SOCKET_EVENTS.BOOKING_CANCELLED);
  return serializers.forRole(user.role, updated);
}

async function reschedule(user, bookingId, { date, time, reason }, req) {
  const booking = await access.assertBookingAccess(user, bookingId);
  if (user.role === ROLES.ASSISTANT) throw ApiError.forbidden();
  if (user.role === ROLES.CUSTOMER) {
    const allowed = String(booking.customerId) === user.id || (await access.getMembership(user.id, booking.parentId))?.permissions.includes(FAMILY_PERMISSIONS.BOOK);
    if (!allowed) throw ApiError.forbidden('You cannot reschedule this visit', 'PERMISSION_REQUIRED');
  }
  const scheduledAt = localToUtc(date, time, booking.timezone);
  assertSlot(scheduledAt, time);
  const endsAt = new Date(scheduledAt.getTime() + booking.durationMinutes * 60000);
  await assertNoParentClash(booking.parentId, scheduledAt, endsAt, booking._id);

  const previousAssistant = booking.assistantId;
  const history = booking.assignment?.history || [];
  if (previousAssistant) {
    const last = history[history.length - 1];
    if (last && last.outcome === 'PENDING') last.outcome = 'CANCELLED';
  }

  const updated = await sm.transition(booking._id, [S.RESCHEDULED, S.PENDING_ADMIN_VERIFICATION], {
    actor: user,
    note: reason,
    set: {
      scheduledAt,
      endsAt,
      scheduledLocal: { date, time },
      'assignment.history': history,
      'assignment.acceptedAt': null,
      'assignment.assignedAt': null,
    },
    unset: { assistantId: 1 },
  });
  await Booking.updateOne({ _id: updated._id }, { $push: { reschedules: { fromAt: booking.scheduledAt, toAt: scheduledAt, by: user.id, reason, at: new Date() } } });

  await audit({ actor: user, action: 'BOOKING_RESCHEDULED', entityType: 'Booking', entityId: booking._id, metadata: { from: booking.scheduledAt, to: scheduledAt, reason }, req });
  const when = formatLocal(scheduledAt, updated.timezone);
  await notifications.notify({ userIds: updated.customerId, type: notifications.TYPES.BOOKING_RESCHEDULED, title: 'Visit rescheduled', body: `${updated.bookingNumber} moved to ${when}.`, data: { bookingId: String(updated._id) } });
  if (previousAssistant) {
    await notifications.notify({ userIds: previousAssistant, type: notifications.TYPES.JOB_RESCHEDULED, title: 'Job rescheduled', body: `${updated.bookingNumber} was moved and unassigned from you.`, data: { bookingId: String(updated._id) } });
  }
  await notifications.notifyAdmins({ type: 'BOOKING_NEEDS_VERIFICATION', title: 'Rescheduled visit needs verification', body: `${updated.bookingNumber} → ${when}`, data: { bookingId: String(updated._id) }, push: false });
  broadcastBooking(updated, SOCKET_EVENTS.BOOKING_RESCHEDULED);
  return serializers.forRole(user.role, updated);
}

/** Customer home summary. */
async function customerHome(user) {
  const parentIds = await access.accessibleParentIds(user.id, FAMILY_PERMISSIONS.VIEW);
  const [parents, upcoming, pendingPayments] = await Promise.all([
    Parent.find({ _id: { $in: parentIds }, status: 'ACTIVE' }).select('fullName gender dateOfBirth lastVisitAt lastOverallStatus relationToOwner').lean(),
    Booking.find({ parentId: { $in: parentIds }, status: { $nin: [...TERMINAL_STATUSES, S.DRAFT, S.PENDING_PAYMENT] }, endsAt: { $gte: new Date() } })
      .sort({ scheduledAt: 1 })
      .limit(5)
      .populate('assistantId', 'name mobile'),
    Booking.find({ customerId: user.id, status: S.PENDING_PAYMENT, scheduledAt: { $gte: new Date() } }).sort({ createdAt: -1 }).limit(5),
  ]);
  const { HealthReport } = require('../models');
  const recentReports = await HealthReport.find({ parentId: { $in: parentIds } })
    .sort({ visitDate: -1 })
    .limit(5)
    .select('reportNumber visitDate overallStatus serviceName parentId data.patient.name')
    .lean();
  const { ageFromDob } = require('../utils/time');
  return {
    greetingName: user.name.split(' ')[0],
    parents: parents.map((p) => ({ ...p, age: ageFromDob(p.dateOfBirth) })),
    upcoming: upcoming.map(serializers.forCustomer),
    pendingPayments: pendingPayments.map(serializers.forCustomer),
    recentReports,
    familyInvitesPending: await FamilyMember.countDocuments({ invitedEmail: user.email, status: 'INVITED' }),
  };
}

module.exports = {
  createOneTime,
  confirmAfterPayment,
  createFromPlanOccurrence,
  listForCustomer,
  getForUser,
  cancel,
  reschedule,
  customerHome,
  buildSnapshots,
  assertSlot,
  FREE_CANCEL_HOURS,
};
