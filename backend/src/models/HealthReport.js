const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// Immutable snapshot of a completed visit. Corrections create a new version.
const healthReportSchema = new mongoose.Schema(
  {
    reportNumber: { type: String, required: true, unique: true },
    bookingId: { type: ObjectId, ref: 'Booking', required: true },
    visitId: { type: ObjectId, ref: 'HealthVisit', required: true },
    parentId: { type: ObjectId, ref: 'Parent', required: true },
    customerId: { type: ObjectId, ref: 'User', required: true },
    assistantId: { type: ObjectId, ref: 'User', required: true },
    serviceName: String,
    visitDate: Date,
    overallStatus: String,
    followUpRequired: Boolean,
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    version: { type: Number, default: 1 },
    pdf: {
      status: { type: String, enum: ['PENDING', 'READY', 'FAILED'], default: 'PENDING' },
      mediaId: { type: ObjectId, ref: 'Media' },
      generatedAt: Date,
      error: String,
    },
  },
  { timestamps: true }
);

healthReportSchema.index({ parentId: 1, visitDate: -1 });
healthReportSchema.index({ customerId: 1, visitDate: -1 });
healthReportSchema.index({ bookingId: 1, version: -1 });

module.exports = mongoose.model('HealthReport', healthReportSchema);
