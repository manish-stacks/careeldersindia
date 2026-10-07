/** SOS (assistant/customer panic) + HEALTH_URGENT (visit marked urgent). Admins always notified. */
const { EmergencyAlert, Parent, FamilyMember } = require('../models');
const { ApiError } = require('../utils/ApiError');
const { parsePagination, pageMeta } = require('../utils/pagination');
const { ROLES } = require('../config/constants');
const { emitTo } = require('../sockets/emitter');
const { rooms, SOCKET_EVENTS } = require('../sockets/events');
const notifications = require('./notification.service');
const access = require('./access.service');
const { audit } = require('./audit.service');

function payload(alert) {
  return {
    alertId: String(alert._id),
    type: alert.type,
    status: alert.status,
    bookingId: alert.bookingId ? String(alert.bookingId) : undefined,
    parentId: alert.parentId ? String(alert.parentId) : undefined,
    message: alert.message,
    location: alert.location,
    createdAt: alert.createdAt,
  };
}

function broadcast(alert) {
  const targets = [rooms.admin()];
  if (alert.bookingId) targets.push(rooms.booking(String(alert.bookingId)));
  emitTo(targets, SOCKET_EVENTS.EMERGENCY_ALERT, payload(alert));
}

/** SOS from the app. With bookingId the caller must have access to it; assistants may also raise one without a job. */
async function raiseSos(user, { bookingId, message, latitude, longitude }, req) {
  const booking = bookingId ? await access.assertBookingAccess(user, bookingId) : null;
  const alert = await EmergencyAlert.create({
    type: 'SOS',
    raisedBy: user.id,
    raisedByRole: user.role,
    bookingId: booking?._id,
    parentId: booking?.parentId,
    customerId: booking?.customerId,
    assistantId: booking?.assistantId,
    message: message || 'SOS raised',
    location: typeof latitude === 'number' ? { lat: latitude, lng: longitude } : undefined,
    escalations: [{ channel: 'ADMIN_PUSH', target: 'admins', status: 'SENT', at: new Date() }],
  });
  await audit({ actor: user, action: 'SOS_RAISED', entityType: 'EmergencyAlert', entityId: alert._id, metadata: { bookingId }, req });
  const where = booking ? ` (${booking.bookingNumber}, ${booking.addressSnapshot?.city || ''})` : '';
  await notifications.notifyAdmins({
    type: notifications.TYPES.ASSISTANT_SOS,
    title: `SOS from ${user.name}`,
    body: `${message || 'Immediate help requested'}${where}`,
    data: { alertId: String(alert._id), bookingId: bookingId ? String(bookingId) : undefined },
  });
  broadcast(alert);
  return alert;
}

/** Called from visit completion when overallStatus = URGENT_ATTENTION. Idempotent per booking. */
async function raiseHealthUrgent({ visit, booking, assistant }) {
  const existing = await EmergencyAlert.findOne({ type: 'HEALTH_URGENT', bookingId: booking._id });
  if (existing) return existing;
  const parent = await Parent.findById(booking.parentId).select('emergencyContacts').lean();
  const alert = await EmergencyAlert.create({
    type: 'HEALTH_URGENT',
    raisedBy: assistant.id,
    raisedByRole: ROLES.ASSISTANT,
    bookingId: booking._id,
    parentId: booking.parentId,
    customerId: booking.customerId,
    assistantId: booking.assistantId,
    message: `${visit.urgent?.reason || 'Urgent attention'} — ${visit.urgent?.notes || ''}`.slice(0, 1000),
    escalations: [
      { channel: 'ADMIN_PUSH', target: 'admins', status: 'SENT', at: new Date() },
      { channel: 'CUSTOMER_PUSH', target: String(booking.customerId), status: 'SENT', at: new Date() },
      ...(parent?.emergencyContacts || []).map((c) => ({ channel: 'CALL_LIST', target: `${c.name} ${c.mobile}`, status: 'PENDING', at: new Date() })),
    ],
  });
  const title = `Urgent: ${booking.parentSnapshot.fullName}`;
  const body = `Assistant recorded urgent attention needed. Recommended: ${String(visit.urgent?.recommendedEscalation || 'OTHER').replace(/_/g, ' ').toLowerCase()}.`;
  await notifications.notifyAdmins({ type: notifications.TYPES.URGENT_HEALTH_ALERT, title, body, data: { alertId: String(alert._id), bookingId: String(booking._id) } });
  const family = await FamilyMember.find({ parentId: booking.parentId, status: 'ACTIVE', permissions: 'VIEW' }).select('userId').lean();
  await notifications.notify({
    userIds: [String(booking.customerId), ...family.map((f) => String(f.userId))],
    type: notifications.TYPES.URGENT_HEALTH_ALERT,
    title,
    body: `${body} Our care team will call you shortly.`,
    data: { alertId: String(alert._id), bookingId: String(booking._id) },
  });
  broadcast(alert);
  return alert;
}

async function list(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.status === 'ACTIVE') filter.status = { $in: ['OPEN', 'ACKNOWLEDGED'] };
  else if (query.status) filter.status = query.status;
  if (query.type) filter.type = query.type;
  const [items, total] = await Promise.all([
    EmergencyAlert.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('raisedBy', 'name role mobile')
      .populate('parentId', 'fullName address.city mobile emergencyContacts')
      .populate('bookingId', 'bookingNumber status')
      .populate('acknowledgedBy resolvedBy', 'name')
      .lean(),
    EmergencyAlert.countDocuments(filter),
  ]);
  return { items, meta: pageMeta({ page, limit }, total) };
}

async function listMine(user) {
  const filter = user.role === ROLES.ASSISTANT ? { raisedBy: user.id } : { customerId: user.id };
  return EmergencyAlert.find(filter).sort({ createdAt: -1 }).limit(50).lean();
}

async function acknowledge(admin, alertId, req) {
  const alert = await EmergencyAlert.findOneAndUpdate({ _id: alertId, status: 'OPEN' }, { $set: { status: 'ACKNOWLEDGED', acknowledgedBy: admin.id, acknowledgedAt: new Date() } }, { new: true });
  if (!alert) throw ApiError.conflict('Alert is not open', 'ALERT_NOT_OPEN');
  await audit({ actor: admin, action: 'EMERGENCY_ACKNOWLEDGED', entityType: 'EmergencyAlert', entityId: alert._id, req });
  await notifications.notify({ userIds: alert.raisedBy, type: 'EMERGENCY_ACKNOWLEDGED', title: 'Care team is on it', body: `${admin.name} has acknowledged the alert.`, data: { alertId: String(alert._id) } });
  broadcast(alert);
  return alert;
}

async function resolve(admin, alertId, { notes }, req) {
  const now = new Date();
  const alert = await EmergencyAlert.findOneAndUpdate(
    { _id: alertId, status: { $in: ['OPEN', 'ACKNOWLEDGED'] } },
    { $set: { status: 'RESOLVED', resolvedBy: admin.id, resolvedAt: now, resolutionNotes: notes } },
    { new: true }
  );
  if (!alert) throw ApiError.conflict('Alert already resolved', 'ALERT_RESOLVED');
  if (!alert.acknowledgedAt) {
    alert.acknowledgedBy = admin.id;
    alert.acknowledgedAt = now;
    await alert.save();
  }
  await audit({ actor: admin, action: 'EMERGENCY_RESOLVED', entityType: 'EmergencyAlert', entityId: alert._id, metadata: { notes }, req });
  broadcast(alert);
  return alert;
}

module.exports = { raiseSos, raiseHealthUrgent, list, listMine, acknowledge, resolve };
