const { Parent, FamilyMember, User, Booking, HealthReport, HealthMeasurement, Media } = require('../models');
const { storage } = require('../config/storage');
const mediaService = require('./media.service');
const { ApiError } = require('../utils/ApiError');
const { FAMILY_PERMISSIONS, TERMINAL_STATUSES } = require('../config/constants');
const access = require('./access.service');
const { audit } = require('./audit.service');
const notifications = require('./notification.service');

const ALL_PERMS = Object.values(FAMILY_PERMISSIONS);

function toLocation(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return undefined;
  return { type: 'Point', coordinates: [lng, lat] };
}

function withLatLng(input) {
  const { latitude, longitude, ...rest } = input;
  const location = toLocation(latitude, longitude);
  return location ? { ...rest, location } : rest;
}

/** Adds a short-lived signed photoUrl to a parent JSON object. */
async function withPhoto(json) {
  if (!json.photoMediaId) return json;
  const media = await Media.findById(json.photoMediaId).select('key').lean();
  return { ...json, photoUrl: media ? await storage.getSignedUrl(media.key) : undefined };
}

async function setPhoto(user, parentId, file, req) {
  const { parent } = await access.assertParentAccess(user, parentId, FAMILY_PERMISSIONS.MANAGE);
  if (!file || !file.mimetype.startsWith('image/')) throw ApiError.badRequest('Please choose a JPG, PNG or WEBP photo', 'INVALID_FILE');
  const media = await mediaService.store({ buffer: file.buffer, mime: file.mimetype, size: file.size, originalName: file.originalname, type: 'PROFILE_PHOTO', uploadedBy: user.id, folder: `parents/${parent._id}`, parentId: parent._id });
  parent.photoMediaId = media._id;
  await parent.save();
  await audit({ actor: user, action: 'PARENT_PHOTO_UPDATED', entityType: 'Parent', entityId: parent._id, req });
  return withPhoto(parent.toJSON());
}

async function listForUser(user) {
  const memberships = await FamilyMember.find({ userId: user.id, status: 'ACTIVE' }).lean();
  const parents = await Parent.find({ _id: { $in: memberships.map((m) => m.parentId) }, status: 'ACTIVE' }).sort({ createdAt: 1 });
  const byParent = new Map(memberships.map((m) => [String(m.parentId), m]));
  const upcoming = await Booking.aggregate([
    { $match: { parentId: { $in: parents.map((p) => p._id) }, scheduledAt: { $gte: new Date() }, status: { $nin: TERMINAL_STATUSES } } },
    { $sort: { scheduledAt: 1 } },
    { $group: { _id: '$parentId', bookingId: { $first: '$_id' }, scheduledAt: { $first: '$scheduledAt' }, status: { $first: '$status' } } },
  ]);
  const nextByParent = new Map(upcoming.map((u) => [String(u._id), u]));
  return Promise.all(parents.map(async (p) => {
    const m = byParent.get(String(p._id));
    return { ...(await withPhoto(p.toJSON())), access: { isOwner: m.isOwner, permissions: m.permissions, relation: m.relation }, nextVisit: nextByParent.get(String(p._id)) || null };
  }));
}

async function create(user, input, req) {
  const parent = await Parent.create({ ...withLatLng(input), ownerId: user.id });
  await FamilyMember.create({ parentId: parent._id, userId: user.id, permissions: ALL_PERMS, isOwner: true, relation: input.relationToOwner, status: 'ACTIVE' });
  await audit({ actor: user, action: 'PARENT_CREATED', entityType: 'Parent', entityId: parent._id, req });
  return parent;
}

async function getDetails(user, parentId) {
  const { parent, membership } = await access.assertParentAccess(user, parentId, FAMILY_PERMISSIONS.VIEW);
  const canManage = !membership || membership.permissions.includes(FAMILY_PERMISSIONS.MANAGE);
  const family = canManage
    ? await FamilyMember.find({ parentId, status: { $ne: 'REVOKED' } }).populate('userId', 'name email').lean()
    : [];
  return { ...(await withPhoto(parent.toJSON())), access: membership ? { isOwner: membership.isOwner, permissions: membership.permissions } : { admin: true }, family };
}

async function update(user, parentId, input, req) {
  const { parent } = await access.assertParentAccess(user, parentId, FAMILY_PERMISSIONS.MANAGE);
  const data = withLatLng(input);
  if (data.address) data.address = { ...parent.address.toObject(), ...data.address };
  parent.set(data);
  await parent.save();
  await audit({ actor: user, action: 'PARENT_UPDATED', entityType: 'Parent', entityId: parent._id, metadata: { fields: Object.keys(input) }, req });
  return parent;
}

async function archive(user, parentId, req) {
  const { parent, membership } = await access.assertParentAccess(user, parentId, FAMILY_PERMISSIONS.MANAGE);
  if (membership && !membership.isOwner) throw ApiError.forbidden('Only the owner can remove this parent', 'OWNER_ONLY');
  const active = await Booking.countDocuments({ parentId, status: { $nin: TERMINAL_STATUSES } });
  if (active) throw ApiError.conflict('Cancel upcoming visits before removing this parent', 'PARENT_HAS_ACTIVE_BOOKINGS');
  parent.status = 'ARCHIVED';
  await parent.save();
  await audit({ actor: user, action: 'PARENT_ARCHIVED', entityType: 'Parent', entityId: parent._id, req });
}

async function inviteFamily(user, parentId, { email, relation, permissions }, req) {
  const { parent } = await access.assertParentAccess(user, parentId, FAMILY_PERMISSIONS.MANAGE);
  const perms = [...new Set([FAMILY_PERMISSIONS.VIEW, ...permissions])];
  const invitee = await User.findOne({ email: email.toLowerCase() }).select('_id role name').lean();
  if (invitee && invitee.role !== 'CUSTOMER') throw ApiError.badRequest('This email belongs to a staff account', 'INVALID_INVITEE');
  if (invitee && String(invitee._id) === String(user.id)) throw ApiError.badRequest('You already have access', 'ALREADY_MEMBER');

  const filter = invitee ? { parentId, userId: invitee._id } : { parentId, invitedEmail: email.toLowerCase() };
  const member = await FamilyMember.findOneAndUpdate(
    filter,
    { $set: { relation, permissions: perms, status: invitee ? 'ACTIVE' : 'INVITED', invitedBy: user.id, invitedEmail: email.toLowerCase(), isOwner: false } },
    { upsert: true, new: true }
  );
  if (invitee) {
    await notifications.notify({ userIds: invitee._id, type: 'FAMILY_ACCESS_GRANTED', title: 'Family access added', body: `${user.name} shared ${parent.fullName}'s care profile with you`, data: { parentId: String(parent._id) } });
  }
  // TODO(prod): email invitation link for users who have not registered yet
  await audit({ actor: user, action: 'FAMILY_MEMBER_INVITED', entityType: 'Parent', entityId: parent._id, metadata: { email, permissions: perms }, req });
  return member;
}

async function updateFamilyMember(user, parentId, memberId, { permissions, relation }, req) {
  await access.assertParentAccess(user, parentId, FAMILY_PERMISSIONS.MANAGE);
  const member = await FamilyMember.findOne({ _id: memberId, parentId });
  if (!member) throw ApiError.notFound('Family member not found', 'MEMBER_NOT_FOUND');
  if (member.isOwner) throw ApiError.badRequest('Owner permissions cannot be changed', 'OWNER_IMMUTABLE');
  if (permissions) member.permissions = [...new Set([FAMILY_PERMISSIONS.VIEW, ...permissions])];
  if (relation !== undefined) member.relation = relation;
  await member.save();
  await audit({ actor: user, action: 'FAMILY_MEMBER_UPDATED', entityType: 'Parent', entityId: parentId, metadata: { memberId, permissions }, req });
  return member;
}

async function revokeFamilyMember(user, parentId, memberId, req) {
  await access.assertParentAccess(user, parentId, FAMILY_PERMISSIONS.MANAGE);
  const member = await FamilyMember.findOne({ _id: memberId, parentId });
  if (!member) throw ApiError.notFound('Family member not found', 'MEMBER_NOT_FOUND');
  if (member.isOwner) throw ApiError.badRequest('Owner cannot be removed', 'OWNER_IMMUTABLE');
  member.status = 'REVOKED';
  await member.save();
  await audit({ actor: user, action: 'FAMILY_MEMBER_REVOKED', entityType: 'Parent', entityId: parentId, metadata: { memberId }, req });
}

const MEASUREMENT_TYPES = ['BP_SYSTOLIC', 'BP_DIASTOLIC', 'PULSE', 'SPO2', 'TEMPERATURE', 'WEIGHT', 'BLOOD_SUGAR'];

async function healthHistory(user, parentId, { from, to, limit = 50 }) {
  await access.assertParentAccess(user, parentId, FAMILY_PERMISSIONS.VIEW);
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  const dateFilter = Object.keys(range).length ? range : undefined;

  const [reports, measurements] = await Promise.all([
    HealthReport.find({ parentId, ...(dateFilter && { visitDate: dateFilter }) })
      .sort({ visitDate: -1 })
      .limit(limit)
      .select('reportNumber visitDate overallStatus followUpRequired serviceName bookingId version pdf.status')
      .lean(),
    HealthMeasurement.find({ parentId, ...(dateFilter && { recordedAt: dateFilter }) }).sort({ recordedAt: 1 }).limit(1000).lean(),
  ]);

  const series = Object.fromEntries(MEASUREMENT_TYPES.map((t) => [t, []]));
  measurements.forEach((m) => series[m.type].push({ value: m.value, unit: m.unit, context: m.context, recordedAt: m.recordedAt }));
  return { reports, series };
}

module.exports = { setPhoto, listForUser, create, getDetails, update, archive, inviteFamily, updateFamilyMember, revokeFamilyMember, healthHistory };
