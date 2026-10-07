const mongoose = require('mongoose');
const { BOOKING_STATUS } = require('../config/constants');

const { ObjectId } = mongoose.Schema.Types;

const statusHistorySchema = new mongoose.Schema(
  {
    from: String,
    to: String,
    at: { type: Date, default: Date.now },
    actorId: { type: ObjectId, ref: 'User' },
    actorRole: String,
    note: String,
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    bookingNumber: { type: String, required: true, unique: true },
    customerId: { type: ObjectId, ref: 'User', required: true },
    parentId: { type: ObjectId, ref: 'Parent', required: true },
    serviceId: { type: ObjectId, ref: 'Service', required: true },
    recurringPlanId: { type: ObjectId, ref: 'RecurringPlan' },
    occurrenceIndex: Number,
    assistantId: { type: ObjectId, ref: 'User' }, // assistant's User id

    scheduledAt: { type: Date, required: true }, // UTC
    endsAt: { type: Date, required: true },
    timezone: { type: String, default: 'Asia/Kolkata' }, // operational timezone (parent location)
    scheduledLocal: { date: String, time: String }, // what the customer picked, in `timezone`
    durationMinutes: { type: Number, required: true },

    status: { type: String, enum: Object.values(BOOKING_STATUS), required: true },
    statusHistory: [statusHistorySchema],

    paymentId: { type: ObjectId, ref: 'Payment' },
    paymentStatus: { type: String, enum: ['UNPAID', 'PAID', 'PREPAID_PLAN', 'REFUNDED', 'PARTIALLY_REFUNDED'], default: 'UNPAID' },
    price: { amount: Number, discount: { type: Number, default: 0 }, currency: { type: String, default: 'INR' } },

    // Snapshots: history stays correct even if parent/service is later edited
    addressSnapshot: { line1: String, line2: String, landmark: String, city: String, state: String, pincode: String },
    locationSnapshot: { lat: Number, lng: Number },
    parentSnapshot: {
      fullName: String,
      gender: String,
      dateOfBirth: Date,
      bloodGroup: String,
      mobile: String,
      medicalConditions: [String],
      medicines: [{ name: String, dosage: String, schedule: { morning: Boolean, afternoon: Boolean, evening: Boolean, night: Boolean } }],
      allergies: [String],
      emergencyContacts: [{ name: String, relation: String, mobile: String }],
      specialInstructions: String,
    },
    serviceSnapshot: { name: String, durationMinutes: Number, fields: mongoose.Schema.Types.Mixed, symptomsList: [String] },

    customerNotes: { type: String, maxlength: 1000 },
    adminNotes: { type: String, maxlength: 2000 },

    assignment: {
      assignedAt: Date,
      assignedBy: { type: ObjectId, ref: 'User' },
      acceptedAt: Date,
      override: { type: Boolean, default: false },
      overrideReason: String,
      history: [
        {
          assistantId: { type: ObjectId, ref: 'User' },
          assignedBy: { type: ObjectId, ref: 'User' },
          assignedAt: Date,
          outcome: { type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'REASSIGNED', 'CANCELLED'] },
          reason: String,
          _id: false,
        },
      ],
    },
    travel: { startedAt: Date, reachedAt: Date },
    visitId: { type: ObjectId, ref: 'HealthVisit' },
    reportId: { type: ObjectId, ref: 'HealthReport' },
    cancellation: { by: { type: ObjectId, ref: 'User' }, role: String, reason: String, at: Date },
    reschedules: [{ fromAt: Date, toAt: Date, by: { type: ObjectId, ref: 'User' }, reason: String, at: Date, _id: false }],
    completedAt: Date,
    reminders: { assistant60m: Date, customer24h: Date },
  },
  { timestamps: true }
);

bookingSchema.index({ customerId: 1, scheduledAt: -1 });
bookingSchema.index({ parentId: 1, scheduledAt: -1 });
bookingSchema.index({ assistantId: 1, scheduledAt: 1 });
bookingSchema.index({ status: 1, scheduledAt: 1 });
bookingSchema.index({ scheduledAt: 1 });
bookingSchema.index({ recurringPlanId: 1, occurrenceIndex: 1 }, { unique: true, partialFilterExpression: { recurringPlanId: { $type: 'objectId' } } });

module.exports = mongoose.model('Booking', bookingSchema);
