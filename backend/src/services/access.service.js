/**
 * Ownership / least-privilege checks. Every data access for CUSTOMER and ASSISTANT goes through here.
 */
const mongoose = require('mongoose');
const { FamilyMember, Booking, Parent } = require('../models');
const { ApiError } = require('../utils/ApiError');
const { ROLES, FAMILY_PERMISSIONS } = require('../config/constants');

const isId = (id) => mongoose.isValidObjectId(id);

/** Parent ids the user can access with a given permission. */
async function accessibleParentIds(userId, permission = FAMILY_PERMISSIONS.VIEW) {
  const rows = await FamilyMember.find({ userId, status: 'ACTIVE', permissions: permission }).select('parentId').lean();
  return rows.map((r) => r.parentId);
}

async function getMembership(userId, parentId) {
  return FamilyMember.findOne({ userId, parentId, status: 'ACTIVE' }).lean();
}

async function assertParentAccess(user, parentId, permission = FAMILY_PERMISSIONS.VIEW) {
  if (!isId(parentId)) throw ApiError.notFound('Parent not found', 'PARENT_NOT_FOUND');
  const parent = await Parent.findById(parentId);
  if (!parent || parent.status === 'ARCHIVED') throw ApiError.notFound('Parent not found', 'PARENT_NOT_FOUND');
  if (user.role === ROLES.ADMIN) return { parent, membership: null };
  if (user.role !== ROLES.CUSTOMER) throw ApiError.forbidden();
  const membership = await getMembership(user.id, parentId);
  // 404 instead of 403 so ids of other families cannot be probed
  if (!membership) throw ApiError.notFound('Parent not found', 'PARENT_NOT_FOUND');
  if (!membership.permissions.includes(permission)) throw ApiError.forbidden(`You need ${permission} permission for this parent`, 'PERMISSION_REQUIRED');
  return { parent, membership };
}

/**
 * CUSTOMER: owns booking, or has VIEW on the parent.
 * ASSISTANT: currently assigned to booking.
 * ADMIN: all.
 */
async function assertBookingAccess(user, bookingId, { select } = {}) {
  if (!isId(bookingId)) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  const q = Booking.findById(bookingId);
  if (select) q.select(select);
  const booking = await q;
  if (!booking) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');

  if (user.role === ROLES.ADMIN) return booking;
  if (user.role === ROLES.ASSISTANT) {
    if (String(booking.assistantId) !== String(user.id)) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
    return booking;
  }
  if (String(booking.customerId) === String(user.id)) return booking;
  const membership = await getMembership(user.id, booking.parentId);
  if (membership?.permissions.includes(FAMILY_PERMISSIONS.VIEW)) return booking;
  throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
}

module.exports = { accessibleParentIds, assertParentAccess, assertBookingAccess, getMembership };
