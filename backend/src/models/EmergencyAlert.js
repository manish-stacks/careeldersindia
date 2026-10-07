const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const emergencyAlertSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['SOS', 'HEALTH_URGENT'], required: true },
    raisedBy: { type: ObjectId, ref: 'User', required: true },
    raisedByRole: String,
    bookingId: { type: ObjectId, ref: 'Booking' },
    parentId: { type: ObjectId, ref: 'Parent' },
    customerId: { type: ObjectId, ref: 'User' },
    assistantId: { type: ObjectId, ref: 'User' },
    message: { type: String, maxlength: 1000 },
    location: { lat: Number, lng: Number },
    status: { type: String, enum: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'], default: 'OPEN' },
    acknowledgedBy: { type: ObjectId, ref: 'User' },
    acknowledgedAt: Date,
    resolvedBy: { type: ObjectId, ref: 'User' },
    resolvedAt: Date,
    resolutionNotes: String,
    escalations: [{ channel: String, target: String, status: String, at: Date, _id: false }],
  },
  { timestamps: true }
);

emergencyAlertSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('EmergencyAlert', emergencyAlertSchema);
