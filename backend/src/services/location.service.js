const { z } = require('zod');
const { Booking, LocationPing } = require('../models');
const { redis } = require('../config/redis');
const { ApiError } = require('../utils/ApiError');
const { TRACKABLE_STATUSES, BOOKING_STATUS: S } = require('../config/constants');
const { emitTo } = require('../sockets/emitter');
const { rooms, SOCKET_EVENTS } = require('../sockets/events');

const LATEST_TTL_SECONDS = 10 * 60;
const PERSIST_EVERY_SECONDS = 30;

const keys = {
  assistant: (id) => `assistant:location:${id}`,
  booking: (id) => `booking:location:${id}`,
  persistGate: (id) => `loc:persist:${id}`,
};

const payloadSchema = z.object({
  bookingId: z.string().regex(/^[a-f\d]{24}$/i),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(10000).optional(),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).max(100).optional(),
  timestamp: z.union([z.number(), z.string()]).optional(),
});

/** Only the assigned assistant, only while travelling/arrived, only fresh fixes. */
async function recordLocation(assistantUserId, raw, { maxAgeMs = 2 * 60000, booking: known } = {}) {
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) throw ApiError.badRequest('Invalid location payload', 'INVALID_LOCATION');
  const p = parsed.data;
  const ts = p.timestamp ? new Date(p.timestamp) : new Date();
  const skew = Date.now() - ts.getTime();
  if (Number.isNaN(ts.getTime()) || skew > maxAgeMs || skew < -60000) throw ApiError.badRequest('Stale location fix', 'STALE_LOCATION');

  const booking = known || (await Booking.findOne({ _id: p.bookingId, assistantId: assistantUserId }).select('status customerId').lean());
  if (!booking) throw ApiError.forbidden('Not assigned to this booking', 'NOT_ASSIGNED');
  if (!TRACKABLE_STATUSES.includes(booking.status)) throw ApiError.conflict('Tracking is only active while on the way', 'TRACKING_INACTIVE');

  // Background fixes can arrive late or out of order — never move the pin backwards in time
  const current = await redis.get(keys.booking(p.bookingId));
  if (current && new Date(JSON.parse(current).timestamp) > ts) return { ...JSON.parse(current), ignored: true };

  const point = { assistantId: String(assistantUserId), bookingId: p.bookingId, latitude: p.latitude, longitude: p.longitude, accuracy: p.accuracy, heading: p.heading, speed: p.speed, timestamp: ts.toISOString() };
  const json = JSON.stringify(point);
  await redis.multi().set(keys.assistant(assistantUserId), json, 'EX', LATEST_TTL_SECONDS).set(keys.booking(p.bookingId), json, 'EX', LATEST_TTL_SECONDS).exec();

  emitTo([rooms.booking(p.bookingId), rooms.admin()], SOCKET_EVENTS.LOCATION_UPDATED, { location: point });

  // Throttled, TTL-bound history for operational audit — not a permanent GPS trail
  const gate = await redis.set(keys.persistGate(p.bookingId), '1', 'EX', PERSIST_EVERY_SECONDS, 'NX');
  if (gate) {
    await LocationPing.create({ assistantId: assistantUserId, bookingId: p.bookingId, location: { type: 'Point', coordinates: [p.longitude, p.latitude] }, accuracy: p.accuracy, heading: p.heading, speed: p.speed, timestamp: ts });
  }
  return point;
}

async function latestForBooking(bookingId) {
  const raw = await redis.get(keys.booking(bookingId));
  return raw ? JSON.parse(raw) : null;
}

async function stopTracking(bookingId, assistantUserId) {
  await redis.del(keys.booking(bookingId), keys.persistGate(bookingId));
  if (assistantUserId) {
    const current = await redis.get(keys.assistant(assistantUserId));
    if (current && JSON.parse(current).bookingId === String(bookingId)) await redis.del(keys.assistant(assistantUserId));
  }
}

/** Admin live map: active jobs + their latest positions. */
async function activeForAdmin() {
  const active = await Booking.find({ $or: [{ status: { $in: [S.ON_THE_WAY, S.REACHED, S.VISIT_STARTED] } }, { status: S.ASSISTANT_ACCEPTED, scheduledAt: { $gte: new Date(Date.now() - 12 * 3600000), $lte: new Date(Date.now() + 12 * 3600000) } }] })
    .select('bookingNumber status scheduledAt assistantId locationSnapshot addressSnapshot parentSnapshot.fullName serviceSnapshot.name')
    .populate('assistantId', 'name mobile')
    .lean();
  if (!active.length) return [];
  const raw = await redis.mget(active.map((b) => keys.booking(b._id)));
  return active.map((b, i) => ({
    bookingId: b._id,
    bookingNumber: b.bookingNumber,
    status: b.status,
    scheduledAt: b.scheduledAt,
    assistant: b.assistantId ? { id: b.assistantId._id, name: b.assistantId.name, mobile: b.assistantId.mobile } : null,
    patientName: b.parentSnapshot?.fullName,
    serviceName: b.serviceSnapshot?.name,
    destination: b.locationSnapshot,
    area: `${b.addressSnapshot?.city || ''} ${b.addressSnapshot?.pincode || ''}`.trim(),
    location: raw[i] ? JSON.parse(raw[i]) : null,
  }));
}

async function trail(bookingId) {
  const pings = await LocationPing.find({ bookingId }).sort({ timestamp: 1 }).limit(2000).lean();
  return pings.map((p) => ({ lat: p.location.coordinates[1], lng: p.location.coordinates[0], timestamp: p.timestamp }));
}

/** Haversine distance in metres. */
function distanceMeters(a, b) {
  if (!a || !b) return null;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * Batch from the phone's background task (OS may deliver several fixes at once, some minutes old).
 * Validates the booking once, records oldest → newest so only the newest is broadcast as "latest".
 */
async function recordTripBatch(assistantUserId, bookingId, points) {
  const booking = await Booking.findOne({ _id: bookingId, assistantId: assistantUserId }).select('status customerId').lean();
  if (!booking) throw ApiError.forbidden('Not assigned to this booking', 'NOT_ASSIGNED');
  if (!TRACKABLE_STATUSES.includes(booking.status)) throw new ApiError(410, 'This trip has ended', 'TRIP_ENDED');
  const sorted = [...points].sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
  let accepted = 0;
  let last = null;
  for (const pt of sorted) {
    try {
      last = await recordLocation(assistantUserId, { ...pt, bookingId }, { maxAgeMs: 15 * 60000, booking });
      if (!last.ignored) accepted += 1;
    } catch (err) {
      if (err.code !== 'STALE_LOCATION' && err.code !== 'INVALID_LOCATION') throw err;
    }
  }
  return { accepted, received: points.length, latest: last && !last.ignored ? last.timestamp : null };
}

module.exports = { recordTripBatch, recordLocation, latestForBooking, stopTracking, activeForAdmin, trail, distanceMeters, keys };
