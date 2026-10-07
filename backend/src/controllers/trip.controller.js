const { z } = require('zod');
const { asyncHandler } = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { ApiError } = require('../utils/ApiError');
const { env } = require('../config/env');
const { Booking } = require('../models');
const tokenService = require('../services/token.service');
const locationService = require('../services/location.service');
const { BOOKING_STATUS: S } = require('../config/constants');

const TRIP_STATUSES = [S.ASSISTANT_ACCEPTED, S.ON_THE_WAY, S.REACHED];

const point = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(10000).nullish().transform((v) => v ?? undefined),
  heading: z.number().min(-1).max(360).nullish().transform((v) => (v === null || v === undefined || v < 0 ? undefined : v)),
  speed: z.number().min(-1).max(100).nullish().transform((v) => (v === null || v === undefined || v < 0 ? undefined : v)),
  timestamp: z.union([z.number(), z.string()]),
});
const batch = z.object({ locations: z.array(point).min(1).max(50) });

module.exports = {
  /** Assistant (normal session) asks for a trip token for one assigned job. */
  issue: asyncHandler(async (req, res) => {
    const booking = await Booking.findOne({ _id: req.params.id, assistantId: req.user.id }).select('status').lean();
    if (!booking) throw ApiError.notFound('Job not found', 'JOB_NOT_FOUND');
    if (!TRIP_STATUSES.includes(booking.status)) throw ApiError.conflict('Trip sharing is only for accepted, travelling or arrived visits', 'TRIP_NOT_ALLOWED');
    return ok(res, { ...tokenService.signTripToken({ assistantId: req.user.id, bookingId: booking._id }), bookingId: String(booking._id) });
  }),

  /** Background task posts here with X-Trip-Token (no user session needed, works with the app closed). */
  locations: asyncHandler(async (req, res) => {
    const token = req.headers['x-trip-token'];
    if (typeof token !== 'string' || !token) throw ApiError.unauthorized('Trip token required', 'TRIP_TOKEN_REQUIRED');
    const { assistantId, bookingId } = tokenService.verifyTripToken(token);
    const parsed = batch.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest('Invalid location batch', 'INVALID_LOCATION');
    return ok(res, await locationService.recordTripBatch(assistantId, bookingId, parsed.data.locations));
  }),

  /** iOS universal links */
  appleAppSiteAssociation: (_req, res) => {
    if (!env.APPLE_TEAM_ID) return res.status(404).json({ success: false, message: 'Not configured' });
    res.type('application/json').send({
      applinks: { details: [{ appIDs: [`${env.APPLE_TEAM_ID}.${env.IOS_BUNDLE_ID}`], components: [{ '/': '/app/*' }] }] },
    });
  },

  /** Android App Links */
  assetLinks: (_req, res) => {
    const prints = env.ANDROID_SHA256_CERT_FINGERPRINTS.split(',').map((s) => s.trim()).filter(Boolean);
    if (!prints.length) return res.status(404).json({ success: false, message: 'Not configured' });
    res.json([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: env.ANDROID_PACKAGE, sha256_cert_fingerprints: prints } }]);
  },

  /** When the app isn't installed, a universal link lands here. */
  appFallback: (req, res) => {
    const deep = `parentcare://${req.path.replace(/^\/app\/?/, '')}`;
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ParentCare</title>
<style>body{font-family:system-ui,sans-serif;background:#F7F8FA;color:#1F2328;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:360px;padding:24px;text-align:center}a{display:block;margin-top:12px;padding:14px;border-radius:12px;background:#C8352E;color:#fff;text-decoration:none;font-weight:600}</style></head>
<body><main><h1>ParentCare</h1><p>Open this in the ParentCare app.</p><a href="${deep.replace(/"/g, '')}">Open the app</a></main></body></html>`);
  },
};
