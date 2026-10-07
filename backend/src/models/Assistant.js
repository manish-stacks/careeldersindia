const mongoose = require('mongoose');
const { ASSISTANT_VERIFICATION } = require('../config/constants');

const assistantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    verificationStatus: { type: String, enum: Object.values(ASSISTANT_VERIFICATION), default: ASSISTANT_VERIFICATION.PENDING },
    verificationHistory: [
      {
        from: String,
        to: String,
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        notes: String,
        at: { type: Date, default: Date.now },
      },
    ],
    gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'] },
    dateOfBirth: Date,
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
    },
    qualification: { type: String, trim: true },
    experienceYears: { type: Number, min: 0, max: 60, default: 0 },
    languages: [{ type: String, trim: true }],
    // Areas the assistant can serve. Empty pincodes => whole city.
    serviceAreas: [{ city: { type: String, trim: true }, pincodes: [{ type: String, trim: true }] }],
    serviceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }], // empty => all services
    workingHours: [
      {
        day: { type: Number, min: 0, max: 6 }, // 0 = Sunday (IST)
        start: { type: String, match: /^\d{2}:\d{2}$/ },
        end: { type: String, match: /^\d{2}:\d{2}$/ },
      },
    ],
    isOnline: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: true },
    lastSeenAt: Date,
    bank: {
      accountHolder: String,
      accountNumberEnc: { type: String, select: false },
      accountLast4: String,
      ifsc: String,
      upiId: String,
    },
    pan: { numberEnc: { type: String, select: false }, last4: String },
    rating: { avg: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
    stats: { completedVisits: { type: Number, default: 0 } },
  },
  { timestamps: true }
);

assistantSchema.index({ verificationStatus: 1 });
assistantSchema.index({ 'serviceAreas.city': 1 });
assistantSchema.index({ 'serviceAreas.pincodes': 1 });

module.exports = mongoose.model('Assistant', assistantSchema);
