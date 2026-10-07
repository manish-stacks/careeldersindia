const { asyncHandler } = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const { ApiError } = require('../utils/ApiError');
const { Notification, Media } = require('../models');
const { parsePagination, pageMeta } = require('../utils/pagination');
const { storage, verifyLocalSignature } = require('../config/storage');
const notifications = require('../services/notification.service');
const mediaService = require('../services/media.service');
const reportService = require('../services/report.service');
const visitService = require('../services/healthVisit.service');
const locationService = require('../services/location.service');
const access = require('../services/access.service');
const emergency = require('../services/emergency.service');

module.exports = {
  listNotifications: asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { userId: req.user.id };
    if (req.query.unread === 'true') filter.readAt = null;
    const [items, total, unread] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId: req.user.id, readAt: null }),
    ]);
    return ok(res, items, 'OK', 200, { ...pageMeta({ page, limit }, total), unread });
  }),
  markRead: asyncHandler(async (req, res) => {
    const filter = { userId: req.user.id, readAt: null };
    if (!req.body.all) filter._id = { $in: req.body.ids || [] };
    const r = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
    return ok(res, { updated: r.modifiedCount });
  }),
  registerToken: asyncHandler(async (req, res) => {
    await notifications.registerToken(req.user.id, req.body);
    return ok(res, {}, 'Device registered');
  }),
  unregisterToken: asyncHandler(async (req, res) => {
    await notifications.unregisterToken(req.user.id, req.body.token);
    return ok(res, {}, 'Device removed');
  }),

  listReports: asyncHandler(async (req, res) => {
    const { items, meta } = await reportService.listForUser(req.user, req.query);
    return ok(res, items, 'OK', 200, meta);
  }),
  getReport: asyncHandler(async (req, res) => ok(res, await reportService.getForUser(req.user, req.params.id))),
  reportPdf: asyncHandler(async (req, res) => ok(res, await reportService.pdfUrl(req.user, req.params.id))),

  bookingVisit: asyncHandler(async (req, res) => ok(res, await visitService.getVisit(req.user, req.params.id))),
  requestCorrection: asyncHandler(async (req, res) => created(res, await visitService.requestCorrection(req.user, req.params.visitId, req.body, req), 'Correction sent for review')),

  bookingLocation: asyncHandler(async (req, res) => {
    const booking = await access.assertBookingAccess(req.user, req.params.id, { select: 'status customerId parentId assistantId' });
    const latest = await locationService.latestForBooking(booking._id);
    return ok(res, { status: booking.status, location: latest });
  }),

  mediaUrl: asyncHandler(async (req, res) => ok(res, await mediaService.signedUrlFor(req.user, req.params.id))),
  /** Local driver only: file for a valid, unexpired HMAC signature (no bearer — used by <img>/PDF viewers). */
  mediaFile: asyncHandler(async (req, res) => {
    const { key, exp, sig } = req.query;
    if (!verifyLocalSignature(key, exp, sig)) throw ApiError.forbidden('Link expired or invalid', 'INVALID_SIGNATURE');
    const media = await Media.findOne({ key }).select('mime originalName').lean();
    if (!media) throw ApiError.notFound('File not found', 'MEDIA_NOT_FOUND');
    const buffer = await storage.get(key);
    res.setHeader('Content-Type', media.mime);
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${(media.originalName || 'file').replace(/[^\w.-]/g, '_')}"`);
    return res.send(buffer);
  }),

  sos: asyncHandler(async (req, res) => created(res, await emergency.raiseSos(req.user, req.body, req), 'Alert sent to the care team')),
  myAlerts: asyncHandler(async (req, res) => ok(res, await emergency.listMine(req.user))),
};
