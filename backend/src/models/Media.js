const mongoose = require('mongoose');
const { MEDIA_TYPES } = require('../config/constants');

// Metadata only. Binary lives in object storage under `key`.
const mediaSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    type: { type: String, enum: MEDIA_TYPES, required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    originalName: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    visitId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthVisit' },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent' },
    caption: { type: String, maxlength: 300 },
  },
  { timestamps: true }
);

mediaSchema.index({ visitId: 1 });
mediaSchema.index({ uploadedBy: 1, createdAt: -1 });

module.exports = mongoose.model('Media', mediaSchema);
