/** Admin read models: dashboard, searchable lists, detail views, broadcast, user status. */
const mongoose = require('mongoose');
const { User, Parent, FamilyMember, Assistant, AssistantDocument, Booking, HealthVisit, HealthReport, Payment, Refund, RecurringPlan, AuditLog, EmergencyAlert, Media, Notification, Service } = require('../models');
const { ApiError } = require('../utils/ApiError');
const { parsePagination, pageMeta, escapeRegex } = require('../utils/pagination');
const { DateTime } = require('../utils/time');
const { BOOKING_STATUS: S, ROLES, ASSISTANT_VERIFICATION: V, OPERATIONAL_TIMEZONE, PAYMENT_STATUS: P } = require('../config/constants');
const mediaService = require('./media.service');
const notifications = require('./notification.service');
const locationService = require('./location.service');
const presence = require('./presence.service');
const { revokeAllForUser } = require('./token.service');
const { audit } = require('./audit.service');

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const ACTIVE_VISIT = [S.ON_THE_WAY, S.REACHED, S.VISIT_STARTED];
const UNASSIGNED = [S.VERIFIED, S.ASSISTANT_REJECTED];
const CANCELLED = [S.CANCELLED_BY_ADMIN, S.CANCELLED_BY_CUSTOMER];

function dayBounds(offsetDays = 0) {
  const start = DateTime.now().setZone(OPERATIONAL_TIMEZONE).startOf('day').plus({ days: offsetDays });
  return { start: start.toJSDate(), end: start.plus({ days: 1 }).toJSDate() };
}

// ---------------------------------------------------------------- dashboard

async function dashboard() {
  const today = dayBounds(0);
  const monthStart = DateTime.now().setZone(OPERATIONAL_TIMEZONE).startOf('month').toJSDate();
  const since14 = dayBounds(-13).start;

  const [
    todaysVisits,
    pendingVerification,
    unassigned,
    active,
    completedToday,
    cancelledToday,
    urgentAlerts,
    pendingAssistants,
    revenueToday,
    revenueMonth,
    refundsMonth,
    trend,
    statusBreakdown,
    upcoming,
    alerts,
    onlineIds,
    customers,
    parents,
  ] = await Promise.all([
    Booking.countDocuments({ scheduledAt: { $gte: today.start, $lt: today.end }, status: { $nin: [...CANCELLED, S.PENDING_PAYMENT, S.DRAFT] } }),
    Booking.countDocuments({ status: S.PENDING_ADMIN_VERIFICATION }),
    Booking.countDocuments({ status: { $in: UNASSIGNED } }),
    Booking.countDocuments({ status: { $in: ACTIVE_VISIT } }),
    Booking.countDocuments({ status: S.COMPLETED, completedAt: { $gte: today.start, $lt: today.end } }),
    Booking.countDocuments({ status: { $in: CANCELLED }, 'cancellation.at': { $gte: today.start, $lt: today.end } }),
    EmergencyAlert.countDocuments({ status: { $in: ['OPEN', 'ACKNOWLEDGED'] } }),
    Assistant.countDocuments({ verificationStatus: { $in: [V.PENDING, V.DOCUMENT_REVIEW] } }),
    Payment.aggregate([{ $match: { status: { $in: [P.CAPTURED, P.PARTIALLY_REFUNDED, P.REFUNDED] }, capturedAt: { $gte: today.start, $lt: today.end } } }, { $group: { _id: null, gross: { $sum: '$amount' } } }]),
    Payment.aggregate([{ $match: { status: { $in: [P.CAPTURED, P.PARTIALLY_REFUNDED, P.REFUNDED] }, capturedAt: { $gte: monthStart } } }, { $group: { _id: null, gross: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    Refund.aggregate([{ $match: { status: { $ne: 'FAILED' }, createdAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Booking.aggregate([
      { $match: { scheduledAt: { $gte: since14, $lt: dayBounds(1).start }, status: { $nin: [S.DRAFT, S.PENDING_PAYMENT] } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$scheduledAt', timezone: OPERATIONAL_TIMEZONE } },
          visits: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', S.COMPLETED] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $in: ['$status', CANCELLED] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Booking.aggregate([{ $match: { scheduledAt: { $gte: monthStart } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Booking.find({ scheduledAt: { $gte: new Date(), $lt: dayBounds(2).start }, status: { $in: [S.PENDING_ADMIN_VERIFICATION, S.VERIFIED, S.ASSISTANT_ASSIGNED, S.ASSISTANT_ACCEPTED, S.ASSISTANT_REJECTED, ...ACTIVE_VISIT] } })
      .sort({ scheduledAt: 1 })
      .limit(8)
      .populate('assistantId', 'name')
      .select('bookingNumber scheduledAt status parentSnapshot.fullName addressSnapshot.city serviceSnapshot.name assistantId')
      .lean(),
    EmergencyAlert.find({ status: { $in: ['OPEN', 'ACKNOWLEDGED'] } }).sort({ createdAt: -1 }).limit(5).populate('parentId', 'fullName').populate('raisedBy', 'name role').lean(),
    presence.onlineAssistantIds().catch(() => []),
    User.countDocuments({ role: ROLES.CUSTOMER, status: 'ACTIVE' }),
    Parent.countDocuments({ status: 'ACTIVE' }),
  ]);

  // fill missing days so the chart is continuous
  const byDay = new Map(trend.map((t) => [t._id, t]));
  const series = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = DateTime.now().setZone(OPERATIONAL_TIMEZONE).minus({ days: i }).toISODate();
    const row = byDay.get(d) || {};
    series.push({ date: d, visits: row.visits || 0, completed: row.completed || 0, cancelled: row.cancelled || 0 });
  }

  return {
    cards: {
      todaysVisits,
      pendingVerification,
      unassigned,
      activeVisits: active,
      completedToday,
      cancelledToday,
      urgentAlerts,
      pendingAssistants,
      assistantsOnline: onlineIds.length,
      customers,
      parents,
      revenueToday: revenueToday[0]?.gross || 0,
      revenueMonth: revenueMonth[0]?.gross || 0,
      paymentsMonth: revenueMonth[0]?.count || 0,
      refundsMonth: refundsMonth[0]?.total || 0,
    },
    trend: series,
    statusBreakdown: statusBreakdown.map((s) => ({ status: s._id, count: s.count })).sort((a, b) => b.count - a.count),
    upcoming,
    alerts,
    generatedAt: new Date(),
  };
}

// ---------------------------------------------------------------- bookings

async function listBookings(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.status) filter.status = { $in: String(query.status).split(',') };
  if (query.queue === 'verification') filter.status = S.PENDING_ADMIN_VERIFICATION;
  if (query.queue === 'unassigned') filter.status = { $in: UNASSIGNED };
  if (query.queue === 'active') filter.status = { $in: ACTIVE_VISIT };
  if (query.queue === 'awaiting_acceptance') filter.status = S.ASSISTANT_ASSIGNED;
  if (query.assistantId) filter.assistantId = query.assistantId;
  if (query.customerId) filter.customerId = query.customerId;
  if (query.parentId) filter.parentId = query.parentId;
  if (query.recurringPlanId) filter.recurringPlanId = query.recurringPlanId;
  if (query.serviceId) filter.serviceId = query.serviceId;
  if (query.city) filter['addressSnapshot.city'] = new RegExp(`^${escapeRegex(query.city)}$`, 'i');
  if (query.recurring === 'true') filter.recurringPlanId = { $exists: true };
  if (query.from || query.to) {
    filter.scheduledAt = {};
    if (query.from) filter.scheduledAt.$gte = DateTime.fromISO(query.from, { zone: OPERATIONAL_TIMEZONE }).startOf('day').toJSDate();
    if (query.to) filter.scheduledAt.$lt = DateTime.fromISO(query.to, { zone: OPERATIONAL_TIMEZONE }).endOf('day').toJSDate();
  }
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ bookingNumber: rx }, { 'parentSnapshot.fullName': rx }, { 'addressSnapshot.pincode': rx }, { 'addressSnapshot.city': rx }];
  }
  const sortKey = query.sort === 'created' ? { createdAt: -1 } : query.sort === 'oldest' ? { scheduledAt: 1 } : { scheduledAt: -1 };
  const [items, total] = await Promise.all([
    Booking.find(filter)
      .sort(sortKey)
      .skip(skip)
      .limit(limit)
      .populate('customerId', 'name email mobile')
      .populate('assistantId', 'name mobile')
      .select('-statusHistory -parentSnapshot.medicines -parentSnapshot.emergencyContacts -assignment.history')
      .lean(),
    Booking.countDocuments(filter),
  ]);
  return { items, meta: pageMeta({ page, limit }, total) };
}

async function getBooking(bookingId) {
  if (!mongoose.isValidObjectId(bookingId)) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  const booking = await Booking.findById(bookingId)
    .populate('customerId', 'name email mobile country timezone')
    .populate('assistantId', 'name email mobile')
    .populate('assignment.history.assistantId', 'name')
    .populate('assignment.history.assignedBy', 'name')
    .populate('statusHistory.actorId', 'name')
    .lean();
  if (!booking) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  const [visit, reports, payment, refunds, auditTrail, liveLocation, alerts, plan] = await Promise.all([
    HealthVisit.findOne({ bookingId }).lean(),
    HealthReport.find({ bookingId }).sort({ version: -1 }).select('reportNumber version overallStatus pdf.status createdAt').lean(),
    booking.paymentId ? Payment.findById(booking.paymentId).lean() : null,
    Refund.find({ bookingId }).sort({ createdAt: -1 }).lean(),
    AuditLog.find({ entityId: oid(bookingId) }).sort({ createdAt: -1 }).limit(50).populate('actorId', 'name').lean(),
    locationService.latestForBooking(bookingId).catch(() => null),
    EmergencyAlert.find({ bookingId }).sort({ createdAt: -1 }).lean(),
    booking.recurringPlanId ? RecurringPlan.findById(booking.recurringPlanId).select('planNumber frequency totalVisits generatedCount status').lean() : null,
  ]);
  let visitMedia = [];
  if (visit?.mediaIds?.length) visitMedia = await mediaService.withUrls(await Media.find({ _id: { $in: visit.mediaIds } }).lean());
  return { booking, visit: visit ? { ...visit, media: visitMedia } : null, reports, payment, refunds, auditTrail, liveLocation, alerts, plan };
}

async function updateBookingNotes(admin, bookingId, { adminNotes }, req) {
  const booking = await Booking.findByIdAndUpdate(bookingId, { $set: { adminNotes } }, { new: true }).select('bookingNumber adminNotes');
  if (!booking) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  await audit({ actor: admin, action: 'BOOKING_NOTES_UPDATED', entityType: 'Booking', entityId: booking._id, req });
  return booking;
}

// ---------------------------------------------------------------- customers & parents

async function listCustomers(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { role: ROLES.CUSTOMER, status: { $ne: 'DELETED' } };
  if (query.status) filter.status = query.status;
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { mobile: rx }];
  }
  const [users, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), User.countDocuments(filter)]);
  const ids = users.map((u) => u._id);
  const [parentCounts, bookingCounts, spend] = await Promise.all([
    FamilyMember.aggregate([{ $match: { userId: { $in: ids }, status: 'ACTIVE' } }, { $group: { _id: '$userId', n: { $sum: 1 } } }]),
    Booking.aggregate([{ $match: { customerId: { $in: ids }, status: { $nin: [S.DRAFT, S.PENDING_PAYMENT] } } }, { $group: { _id: '$customerId', n: { $sum: 1 }, last: { $max: '$scheduledAt' } } }]),
    Payment.aggregate([{ $match: { customerId: { $in: ids }, status: { $in: [P.CAPTURED, P.PARTIALLY_REFUNDED] } } }, { $group: { _id: '$customerId', total: { $sum: { $subtract: ['$amount', '$refundedAmount'] } } } }]),
  ]);
  const m = (rows, key = 'n') => new Map(rows.map((r) => [String(r._id), r[key]]));
  const pc = m(parentCounts);
  const bc = m(bookingCounts);
  const last = m(bookingCounts, 'last');
  const sp = m(spend, 'total');
  const items = users.map((u) => ({ ...u, parentsCount: pc.get(String(u._id)) || 0, bookingsCount: bc.get(String(u._id)) || 0, lastBookingAt: last.get(String(u._id)) || null, totalSpend: sp.get(String(u._id)) || 0 }));
  return { items, meta: pageMeta({ page, limit }, total) };
}

async function getCustomer(userId) {
  const user = await User.findOne({ _id: userId, role: ROLES.CUSTOMER }).lean();
  if (!user) throw ApiError.notFound('Customer not found', 'CUSTOMER_NOT_FOUND');
  const memberships = await FamilyMember.find({ userId, status: 'ACTIVE' }).lean();
  const [parents, bookings, payments, plans] = await Promise.all([
    Parent.find({ _id: { $in: memberships.map((mm) => mm.parentId) } }).lean(),
    Booking.find({ customerId: userId }).sort({ scheduledAt: -1 }).limit(20).select('bookingNumber scheduledAt status parentSnapshot.fullName serviceSnapshot.name price paymentStatus').lean(),
    Payment.find({ customerId: userId }).sort({ createdAt: -1 }).limit(20).lean(),
    RecurringPlan.find({ customerId: userId }).sort({ createdAt: -1 }).populate('serviceId', 'name').populate('parentId', 'fullName').lean(),
  ]);
  const permsByParent = new Map(memberships.map((mm) => [String(mm.parentId), { permissions: mm.permissions, isOwner: mm.isOwner, relation: mm.relation }]));
  return { user, parents: parents.map((p) => ({ ...p, age: require('../utils/time').ageFromDob(p.dateOfBirth), membership: permsByParent.get(String(p._id)) })), bookings, payments, plans };
}

async function listParents(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { status: query.status || 'ACTIVE' };
  if (query.city) filter['address.city'] = new RegExp(`^${escapeRegex(query.city)}$`, 'i');
  if (query.overallStatus) filter.lastOverallStatus = query.overallStatus;
  if (query.ownerId) filter.ownerId = query.ownerId;
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ fullName: rx }, { mobile: rx }, { 'address.pincode': rx }, { 'address.city': rx }];
  }
  const [items, total] = await Promise.all([
    Parent.find(filter).sort({ lastVisitAt: -1, createdAt: -1 }).skip(skip).limit(limit).populate('ownerId', 'name email').select('-medicines -emergencyContacts').lean(),
    Parent.countDocuments(filter),
  ]);
  const { ageFromDob } = require('../utils/time');
  return { items: items.map((p) => ({ ...p, age: ageFromDob(p.dateOfBirth) })), meta: pageMeta({ page, limit }, total) };
}

async function getParent(parentId) {
  const parent = await Parent.findById(parentId).populate('ownerId', 'name email mobile').lean();
  if (!parent) throw ApiError.notFound('Parent not found', 'PARENT_NOT_FOUND');
  const { ageFromDob } = require('../utils/time');
  const [family, bookings, reports, measurements] = await Promise.all([
    FamilyMember.find({ parentId, status: { $ne: 'REVOKED' } }).populate('userId', 'name email mobile').lean(),
    Booking.find({ parentId }).sort({ scheduledAt: -1 }).limit(20).populate('assistantId', 'name').select('bookingNumber scheduledAt status serviceSnapshot.name assistantId').lean(),
    HealthReport.find({ parentId }).sort({ visitDate: -1 }).limit(20).select('reportNumber visitDate overallStatus serviceName version followUpRequired').lean(),
    require('../models').HealthMeasurement.find({ parentId }).sort({ recordedAt: 1 }).limit(500).lean(),
  ]);
  return { parent: { ...parent, age: ageFromDob(parent.dateOfBirth) }, family, bookings, reports, measurements };
}

// ---------------------------------------------------------------- assistants

async function listAssistants(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.verificationStatus) filter.verificationStatus = { $in: String(query.verificationStatus).split(',') };
  if (query.city) filter['serviceAreas.city'] = new RegExp(`^${escapeRegex(query.city)}$`, 'i');
  if (query.online === 'true') filter.isOnline = true;
  let userFilterIds = null;
  const goneIds = (await User.find({ role: ROLES.ASSISTANT, status: 'DELETED' }).select('_id').lean()).map((u) => u._id);
  if (goneIds.length) filter.userId = { $nin: goneIds };
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    const users = await User.find({ role: ROLES.ASSISTANT, status: { $ne: 'DELETED' }, $or: [{ name: rx }, { email: rx }, { mobile: rx }] }).select('_id').lean();
    userFilterIds = users.map((u) => u._id);
    filter.userId = { $in: userFilterIds };
  }
  const [profiles, total] = await Promise.all([
    Assistant.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('userId', 'name email mobile status lastLoginAt').populate('serviceIds', 'name').lean(),
    Assistant.countDocuments(filter),
  ]);
  const today = dayBounds(0);
  const jobs = await Booking.aggregate([
    { $match: { assistantId: { $in: profiles.map((p) => p.userId?._id).filter(Boolean) }, scheduledAt: { $gte: today.start, $lt: today.end }, status: { $nin: CANCELLED } } },
    { $group: { _id: '$assistantId', n: { $sum: 1 } } },
  ]);
  const jobsMap = new Map(jobs.map((j) => [String(j._id), j.n]));
  const items = profiles.map((p) => ({ ...p, jobsToday: jobsMap.get(String(p.userId?._id)) || 0 }));
  return { items, meta: pageMeta({ page, limit }, total) };
}

async function getAssistant(assistantUserId) {
  const profile = await Assistant.findOne({ userId: assistantUserId }).populate('userId', 'name email mobile status createdAt lastLoginAt').populate('verificationHistory.by', 'name').populate('serviceIds', 'name').lean();
  if (!profile) throw ApiError.notFound('Assistant not found', 'ASSISTANT_NOT_FOUND');
  const docs = await AssistantDocument.find({ assistantUserId }).sort({ createdAt: -1 }).populate('reviewedBy', 'name').lean();
  const docMedia = await Media.find({ _id: { $in: docs.map((d) => d.mediaId) } }).lean();
  const urls = new Map((await mediaService.withUrls(docMedia)).map((m) => [String(m._id), m]));
  const [recentJobs, stats, location] = await Promise.all([
    Booking.find({ assistantId: assistantUserId }).sort({ scheduledAt: -1 }).limit(20).select('bookingNumber scheduledAt status parentSnapshot.fullName addressSnapshot.city serviceSnapshot.name').lean(),
    Booking.aggregate([{ $match: { 'assignment.history.assistantId': oid(assistantUserId) } }, { $unwind: '$assignment.history' }, { $match: { 'assignment.history.assistantId': oid(assistantUserId) } }, { $group: { _id: '$assignment.history.outcome', n: { $sum: 1 } } }]),
    require('../config/redis').redis.get(locationService.keys.assistant(assistantUserId)).then((v) => (v ? JSON.parse(v) : null)).catch(() => null),
  ]);
  if (profile.bank) delete profile.bank.accountNumberEnc;
  if (profile.pan) delete profile.pan.numberEnc;
  return {
    profile,
    documents: docs.map((d) => ({ ...d, file: urls.get(String(d.mediaId)) || null })),
    recentJobs,
    assignmentStats: Object.fromEntries(stats.map((s) => [s._id, s.n])),
    lastLocation: location,
  };
}

async function reviewDocument(admin, documentId, { status, notes }, req) {
  const doc = await AssistantDocument.findByIdAndUpdate(documentId, { $set: { status, reviewNotes: notes, reviewedBy: admin.id, reviewedAt: new Date() } }, { new: true });
  if (!doc) throw ApiError.notFound('Document not found', 'DOCUMENT_NOT_FOUND');
  await audit({ actor: admin, action: `ASSISTANT_DOCUMENT_${status}`, entityType: 'AssistantDocument', entityId: doc._id, metadata: { notes }, req });
  return doc;
}

// ---------------------------------------------------------------- users

async function setUserStatus(admin, userId, { status, reason }, req) {
  if (String(userId) === admin.id) throw ApiError.badRequest('You cannot change your own status', 'SELF_STATUS');
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  // Admin accounts are managed from Team & roles; a delegated admin must never be able to lock out a super admin here.
  if (user.role === ROLES.ADMIN && !admin.isSuper) throw ApiError.forbidden('Only a super admin can change another admin', 'FORBIDDEN');
  if (user.role === ROLES.ADMIN && status !== 'ACTIVE') {
    const admins = await User.countDocuments({ role: ROLES.ADMIN, status: 'ACTIVE' });
    if (admins <= 1) throw ApiError.conflict('Cannot suspend the last active admin', 'LAST_ADMIN');
  }
  user.status = status;
  await user.save();
  if (status !== 'ACTIVE') {
    await revokeAllForUser(user._id);
    if (user.role === ROLES.ASSISTANT) await Assistant.updateOne({ userId: user._id }, { isOnline: false, isAvailable: false });
  }
  await audit({ actor: admin, action: status === 'ACTIVE' ? 'USER_REACTIVATED' : 'USER_SUSPENDED', entityType: 'User', entityId: user._id, metadata: { reason }, req });
  return { _id: user._id, status: user.status };
}

// ---------------------------------------------------------------- audit + notifications

async function listAuditLogs(query) {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 50, maxLimit: 200 });
  const filter = {};
  if (query.action) filter.action = new RegExp(escapeRegex(query.action), 'i');
  if (query.entityType) filter.entityType = query.entityType;
  if (query.entityId && mongoose.isValidObjectId(query.entityId)) filter.entityId = oid(query.entityId);
  if (query.actorId && mongoose.isValidObjectId(query.actorId)) filter.actorId = oid(query.actorId);
  if (query.actorRole) filter.actorRole = query.actorRole;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = DateTime.fromISO(query.to).endOf('day').toJSDate();
  }
  const [items, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('actorId', 'name email role').lean(), AuditLog.countDocuments(filter)]);
  return { items, meta: pageMeta({ page, limit }, total) };
}

async function broadcast(admin, { audience, userIds, emails, title, body, screen, recordId, url }, req) {
  let ids = userIds || [];
  if (audience === 'ALL_CUSTOMERS') ids = (await User.find({ role: ROLES.CUSTOMER, status: 'ACTIVE' }).select('_id').lean()).map((u) => u._id);
  if (audience === 'ALL_ASSISTANTS') ids = (await User.find({ role: ROLES.ASSISTANT, status: 'ACTIVE' }).select('_id').lean()).map((u) => u._id);
  if (audience === 'APPROVED_ASSISTANTS') ids = (await Assistant.find({ verificationStatus: V.APPROVED }).select('userId').lean()).map((a) => a.userId);
  if (audience === 'USERS' && emails?.length) {
    const found = await User.find({ email: { $in: emails.map((e) => e.toLowerCase()) }, status: 'ACTIVE', role: { $ne: ROLES.ADMIN } }).select('_id').lean();
    ids = [...ids, ...found.map((u) => u._id)];
  }
  ids = [...new Set(ids.map(String))];
  if (!ids.length) throw ApiError.badRequest('No recipients', 'NO_RECIPIENTS');

  // Screen link travels in the push data + stored notification, so taps route the same from push or inbox
  const link = {};
  if (screen) {
    const { APP_SCREENS } = require('../config/constants');
    link.screen = screen;
    if (APP_SCREENS[screen].param) link[APP_SCREENS[screen].param] = String(recordId);
  }
  if (url) link.url = url;

  await notifications.notify({ userIds: ids, type: notifications.TYPES.ADMIN_MESSAGE, title, body, data: { from: 'admin', ...link }, push: true });
  await audit({ actor: admin, action: 'NOTIFICATION_BROADCAST', entityType: 'Notification', metadata: { audience, recipients: ids.length, title, ...link }, req });
  return { recipients: ids.length };
}

function appScreens() {
  const { APP_SCREENS } = require('../config/constants');
  return Object.entries(APP_SCREENS).map(([key, v]) => ({ key, ...v }));
}

async function recentBroadcasts() {
  return AuditLog.find({ action: 'NOTIFICATION_BROADCAST' }).sort({ createdAt: -1 }).limit(20).populate('actorId', 'name').lean();
}

async function listReports(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.overallStatus) filter.overallStatus = query.overallStatus;
  if (query.followUpRequired === 'true') filter.followUpRequired = true;
  if (query.parentId) filter.parentId = query.parentId;
  if (query.customerId) filter.customerId = query.customerId;
  if (query.assistantId) filter.assistantId = query.assistantId;
  if (query.bookingId) filter.bookingId = query.bookingId;
  if (query.from || query.to) {
    filter.visitDate = {};
    if (query.from) filter.visitDate.$gte = DateTime.fromISO(query.from, { zone: OPERATIONAL_TIMEZONE }).startOf('day').toJSDate();
    if (query.to) filter.visitDate.$lte = DateTime.fromISO(query.to, { zone: OPERATIONAL_TIMEZONE }).endOf('day').toJSDate();
  }
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ reportNumber: rx }, { 'data.patient.name': rx }, { 'data.visit.bookingNumber': rx }];
  }
  const [items, total] = await Promise.all([
    HealthReport.find(filter).sort({ visitDate: -1 }).skip(skip).limit(limit).select('reportNumber visitDate overallStatus followUpRequired serviceName parentId bookingId version pdf.status data.patient.name data.patient.city data.assistant.name data.visit.bookingNumber').lean(),
    HealthReport.countDocuments(filter),
  ]);
  return { items, meta: pageMeta({ page, limit }, total) };
}

async function servicesWithUsage() {
  const [services, usage] = await Promise.all([
    Service.find().sort({ sortOrder: 1, name: 1 }).lean(),
    Booking.aggregate([{ $match: { status: { $nin: [S.DRAFT, S.PENDING_PAYMENT] } } }, { $group: { _id: '$serviceId', n: { $sum: 1 } } }]),
  ]);
  const u = new Map(usage.map((r) => [String(r._id), r.n]));
  return services.map((s) => ({ ...s, bookingsCount: u.get(String(s._id)) || 0 }));
}

async function unreadCountFor(userId) {
  return Notification.countDocuments({ userId, readAt: null });
}

/** Hard delete a plan that was never used. Plans with completed visits or payments must be cancelled so history and refunds are kept. */
async function deletePlan(admin, id, req) {
  const plan = await RecurringPlan.findById(id);
  if (!plan) throw ApiError.notFound('Plan not found', 'PLAN_NOT_FOUND');
  const bookings = await Booking.find({ recurringPlanId: plan._id }).select('_id status').lean();
  const UNSTARTED = [S.DRAFT, S.PENDING_PAYMENT, S.PAYMENT_SUCCESS, S.PENDING_ADMIN_VERIFICATION, S.VERIFIED, S.ASSISTANT_ASSIGNED, S.ASSISTANT_ACCEPTED, S.CANCELLED_BY_CUSTOMER, S.CANCELLED_BY_ADMIN];
  const used = bookings.some((b) => !UNSTARTED.includes(b.status));
  if (used || (await Payment.exists({ recurringPlanId: plan._id, status: P.CAPTURED }))) {
    throw ApiError.conflict('This plan already has visits or payments. Cancel it instead so the history is kept.', 'PLAN_IN_USE');
  }
  const ids = bookings.map((b) => b._id);
  await HealthVisit.deleteMany({ bookingId: { $in: ids } });
  await Booking.deleteMany({ _id: { $in: ids } });
  await RecurringPlan.deleteOne({ _id: plan._id });
  await audit({ actor: admin, action: 'PLAN_DELETED', entityType: 'RecurringPlan', entityId: plan._id, req });
  return { deletedVisits: ids.length };
}


// ---------------------------------------------------------------- assistant workload
const DONE = [S.VISIT_COMPLETED, S.REPORT_GENERATED];
const BUSY_NOW = [S.ON_THE_WAY, S.REACHED, S.VISIT_STARTED];
const WAITING = [S.ASSISTANT_ASSIGNED, S.ASSISTANT_ACCEPTED];
const COUNTED = { $nin: [...CANCELLED, S.DRAFT, S.PENDING_PAYMENT, S.PAYMENT_SUCCESS, S.PENDING_ADMIN_VERIFICATION, S.VERIFIED, S.ASSISTANT_REJECTED] };

function rangeOf(query) {
  const today = DateTime.now().setZone(OPERATIONAL_TIMEZONE).toISODate();
  const from = query.from || query.to || today;
  const to = query.to || from;
  return {
    from, to,
    start: DateTime.fromISO(from, { zone: OPERATIONAL_TIMEZONE }).startOf('day').toJSDate(),
    end: DateTime.fromISO(to, { zone: OPERATIONAL_TIMEZONE }).endOf('day').toJSDate(),
  };
}

/** One row per assistant: how many visits were assigned in the date range and how they went, plus day-by-day counts. */
async function assistantWorkload(query) {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 25 });
  const r = rangeOf(query);
  const userFilter = { role: ROLES.ASSISTANT, status: { $ne: 'DELETED' } };
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    userFilter.$or = [{ name: rx }, { email: rx }, { mobile: rx }];
  }
  const users = await User.find(userFilter).select('name email mobile status').sort({ name: 1 }).lean();
  const approved = new Set((await Assistant.find({ userId: { $in: users.map((u) => u._id) }, verificationStatus: V.APPROVED }).select('userId').lean()).map((a) => String(a.userId)));
  const ids = users.filter((u) => approved.has(String(u._id))).map((u) => u._id);
  const match = { assistantId: { $in: ids }, scheduledAt: { $gte: r.start, $lte: r.end }, status: COUNTED };
  const [totals, perDay, rejected] = await Promise.all([
    Booking.aggregate([
      { $match: match },
      { $group: { _id: '$assistantId', assigned: { $sum: 1 }, completed: { $sum: { $cond: [{ $in: ['$status', DONE] }, 1, 0] } }, active: { $sum: { $cond: [{ $in: ['$status', BUSY_NOW] }, 1, 0] } }, waiting: { $sum: { $cond: [{ $in: ['$status', WAITING] }, 1, 0] } }, noShow: { $sum: { $cond: [{ $eq: ['$status', S.NO_SHOW] }, 1, 0] } }, minutes: { $sum: '$durationMinutes' } } },
    ]),
    Booking.aggregate([
      { $match: match },
      { $group: { _id: { a: '$assistantId', d: { $dateToString: { format: '%Y-%m-%d', date: '$scheduledAt', timezone: OPERATIONAL_TIMEZONE } } }, n: { $sum: 1 }, done: { $sum: { $cond: [{ $in: ['$status', DONE] }, 1, 0] } } } },
      { $sort: { '_id.d': 1 } },
    ]),
    Booking.aggregate([
      { $match: { scheduledAt: { $gte: r.start, $lte: r.end }, 'assignment.history.outcome': 'REJECTED' } },
      { $unwind: '$assignment.history' }, { $match: { 'assignment.history.outcome': 'REJECTED', 'assignment.history.assistantId': { $in: ids } } },
      { $group: { _id: '$assignment.history.assistantId', n: { $sum: 1 } } },
    ]),
  ]);
  const t = new Map(totals.map((x) => [String(x._id), x]));
  const rej = new Map(rejected.map((x) => [String(x._id), x.n]));
  const days = new Map();
  for (const d of perDay) {
    const k = String(d._id.a);
    if (!days.has(k)) days.set(k, []);
    days.get(k).push({ date: d._id.d, count: d.n, completed: d.done });
  }
  let rows = users.filter((u) => approved.has(String(u._id))).map((u) => {
    const x = t.get(String(u._id)) || {};
    const daily = days.get(String(u._id)) || [];
    return {
      assistantId: u._id, name: u.name, email: u.email, mobile: u.mobile, loginStatus: u.status,
      assigned: x.assigned || 0, completed: x.completed || 0, active: x.active || 0, waiting: x.waiting || 0, noShow: x.noShow || 0, rejected: rej.get(String(u._id)) || 0,
      minutes: x.minutes || 0, workingDays: daily.length, maxPerDay: daily.reduce((m, d) => Math.max(m, d.count), 0), daily,
    };
  });
  const sort = query.sort || 'assigned';
  rows.sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'completed' ? b.completed - a.completed : b.assigned - a.assigned) || a.name.localeCompare(b.name));
  const summary = { assistants: rows.length, assigned: rows.reduce((n, x) => n + x.assigned, 0), completed: rows.reduce((n, x) => n + x.completed, 0), idle: rows.filter((x) => !x.assigned).length };
  const total = rows.length;
  rows = rows.slice(skip, skip + limit);
  return { items: rows, meta: { ...pageMeta({ page, limit }, total), summary, from: r.from, to: r.to } };
}

/** Full-day report for one assistant: every visit, grouped by day. */
async function assistantDayReport(assistantUserId, query) {
  const r = rangeOf(query);
  const user = await User.findOne({ _id: assistantUserId, role: ROLES.ASSISTANT }).select('name email mobile').lean();
  if (!user) throw ApiError.notFound('Assistant not found', 'ASSISTANT_NOT_FOUND');
  const visits = await Booking.find({ assistantId: assistantUserId, scheduledAt: { $gte: r.start, $lte: r.end }, status: { $nin: [...CANCELLED, S.DRAFT, S.PENDING_PAYMENT] } })
    .sort({ scheduledAt: 1 }).select('bookingNumber scheduledAt endsAt durationMinutes status parentSnapshot.fullName addressSnapshot.city addressSnapshot.line1 serviceSnapshot.name recurringPlanId').lean();
  const byDay = new Map();
  for (const v of visits) {
    const date = DateTime.fromJSDate(v.scheduledAt, { zone: OPERATIONAL_TIMEZONE }).toISODate();
    if (!byDay.has(date)) byDay.set(date, []);
    byDay.get(date).push(v);
  }
  const days = [...byDay.entries()].map(([date, list]) => ({
    date, total: list.length, completed: list.filter((v) => DONE.includes(v.status)).length,
    minutes: list.reduce((n, v) => n + (v.durationMinutes || 0), 0), visits: list,
  }));
  return { assistant: user, from: r.from, to: r.to, totalVisits: visits.length, completed: days.reduce((n, d) => n + d.completed, 0), days };
}

module.exports = {
  assistantWorkload,
  assistantDayReport,
  deletePlan,
  dashboard,
  listBookings,
  getBooking,
  updateBookingNotes,
  listCustomers,
  getCustomer,
  listParents,
  getParent,
  listAssistants,
  getAssistant,
  reviewDocument,
  setUserStatus,
  listAuditLogs,
  broadcast,
  recentBroadcasts,
  appScreens,
  listReports,
  servicesWithUsage,
  unreadCountFor,
};
