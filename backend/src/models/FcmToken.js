const mongoose = require('mongoose');

// One row per device. A user can have many devices.
const fcmTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['ios', 'android', 'web'], required: true },
    deviceId: String,
    appVersion: String,
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

fcmTokenSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model('FcmToken', fcmTokenSchema);
