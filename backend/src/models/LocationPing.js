const mongoose = require('mongoose');
const { env } = require('../config/env');

// Throttled operational history only (latest position lives in Redis). Auto-expires.
const locationPingSchema = new mongoose.Schema(
  {
    assistantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    location: { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: [Number] },
    accuracy: Number,
    heading: Number,
    speed: Number,
    timestamp: { type: Date, required: true },
  },
  { versionKey: false }
);

locationPingSchema.index({ assistantId: 1, timestamp: -1 });
locationPingSchema.index({ bookingId: 1, timestamp: 1 });
locationPingSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * env.LOCATION_HISTORY_TTL_DAYS });

module.exports = mongoose.model('LocationPing', locationPingSchema);
