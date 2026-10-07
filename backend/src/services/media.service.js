const crypto = require('crypto');
const { Media, Booking } = require('../models');
const { storage } = require('../config/storage');
const { ApiError } = require('../utils/ApiError');
const { ROLES } = require('../config/constants');
const access = require('./access.service');

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

function buildKey(folder, mime) {
  const d = new Date();
  return `${folder}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${EXT[mime] || 'bin'}`;
}

async function store({ buffer, mime, size, originalName, type, uploadedBy, folder, bookingId, visitId, parentId, caption }) {
  const key = buildKey(folder, mime);
  await storage.put(key, buffer, mime);
  return Media.create({ key, type, mime, size, originalName: originalName?.slice(0, 200), uploadedBy, bookingId, visitId, parentId, caption });
}

/** Signed URL after checking the requester may see this media. */
async function signedUrlFor(user, mediaId) {
  const media = await Media.findById(mediaId);
  if (!media) throw ApiError.notFound('File not found', 'MEDIA_NOT_FOUND');
  await assertMediaAccess(user, media);
  return { url: await storage.getSignedUrl(media.key), mime: media.mime, type: media.type, expiresInSeconds: 900 };
}

async function assertMediaAccess(user, media) {
  if (user.role === ROLES.ADMIN) return;
  if (String(media.uploadedBy) === user.id) return;
  if (media.bookingId) {
    await access.assertBookingAccess(user, media.bookingId);
    return;
  }
  if (media.parentId && user.role === ROLES.CUSTOMER) {
    await access.assertParentAccess(user, media.parentId);
    return;
  }
  throw ApiError.notFound('File not found', 'MEDIA_NOT_FOUND');
}

async function withUrls(mediaDocs) {
  return Promise.all(
    (mediaDocs || []).map(async (m) => ({ _id: m._id, type: m.type, mime: m.mime, caption: m.caption, createdAt: m.createdAt, url: await storage.getSignedUrl(m.key) }))
  );
}

async function assertVisitUploadAllowed(user, bookingId) {
  const booking = await Booking.findById(bookingId).select('assistantId status visitId parentId');
  if (!booking || String(booking.assistantId) !== user.id) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  if (booking.status !== 'VISIT_STARTED') throw ApiError.conflict('Photos can only be added during an active visit', 'VISIT_NOT_ACTIVE');
  return booking;
}

module.exports = { store, signedUrlFor, withUrls, assertMediaAccess, assertVisitUploadAllowed };
