const mongoose = require('mongoose');
const { OVERALL_STATUS } = require('../config/constants');

const { ObjectId } = mongoose.Schema.Types;

const measurementsSchema = new mongoose.Schema(
  {
    bp: { systolic: Number, diastolic: Number },
    pulse: Number,
    spo2: Number,
    temperature: { value: Number, unit: { type: String, enum: ['F', 'C'], default: 'F' } },
    weight: { value: Number, unit: { type: String, enum: ['KG'], default: 'KG' } },
    bloodSugar: { value: Number, unit: { type: String, default: 'mg/dL' }, context: { type: String, enum: ['FASTING', 'RANDOM', 'POST_MEAL'] } },
  },
  { _id: false }
);

const healthVisitSchema = new mongoose.Schema(
  {
    bookingId: { type: ObjectId, ref: 'Booking', required: true, unique: true },
    parentId: { type: ObjectId, ref: 'Parent', required: true },
    assistantId: { type: ObjectId, ref: 'User', required: true },
    serviceId: { type: ObjectId, ref: 'Service', required: true },
    status: { type: String, enum: ['IN_PROGRESS', 'COMPLETED'], default: 'IN_PROGRESS' },
    startedAt: { type: Date, required: true },
    completedAt: Date,

    measurements: { type: measurementsSchema, default: {} },
    symptoms: [{ type: String, trim: true }],
    symptomNotes: { type: String, maxlength: 2000 },
    // What was REPORTED about medicines taken — not a prescription record
    medicationStatus: [
      {
        medicineName: String,
        slot: { type: String, enum: ['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT'] },
        status: { type: String, enum: ['TAKEN', 'MISSED', 'NOT_DUE', 'UNKNOWN'] },
        reportedBy: { type: String, enum: ['PATIENT', 'ASSISTANT', 'FAMILY', 'CAREGIVER'], default: 'PATIENT' },
        _id: false,
      },
    ],
    mobility: { type: String, enum: ['INDEPENDENT', 'NEEDS_SUPPORT', 'ASSISTED_DEVICE', 'BEDRIDDEN'] },
    wellbeing: {
      appetite: { type: String, enum: ['GOOD', 'REDUCED', 'POOR'] },
      sleep: { type: String, enum: ['GOOD', 'DISTURBED', 'POOR'] },
      mood: { type: String, enum: ['CHEERFUL', 'CALM', 'LOW', 'ANXIOUS', 'CONFUSED'] },
      hydration: { type: String, enum: ['ADEQUATE', 'LOW'] },
    },
    notes: { type: String, maxlength: 5000 },
    mediaIds: [{ type: ObjectId, ref: 'Media' }],
    // Daily Services Entry Sheet + Blood Haematology Report
    reportMode: { type: String, enum: ['FORM', 'IMAGE'], default: 'FORM' }, // IMAGE = assistant uploaded a photo/scan of the paper report
    servicesPerformed: [{ type: String, trim: true }],
    reports: [{ templateId: mongoose.Schema.Types.ObjectId, name: String, kind: String, reportDate: String, checked: [String], values: [{ key: String, label: String, value: { type: String, maxlength: 200 }, _id: false }], _id: false }],
    labReport: { reportDate: String, values: [{ key: String, label: String, value: { type: String, maxlength: 200 }, _id: false }] },

    overallStatus: { type: String, enum: Object.values(OVERALL_STATUS) },
    urgent: { reason: String, notes: String, recommendedEscalation: { type: String, enum: ['CALL_FAMILY', 'CALL_DOCTOR', 'AMBULANCE', 'HOSPITAL_VISIT', 'OTHER'] } },
    followUpRequired: { type: Boolean, default: false },
    followUpNotes: String,

    draftSavedAt: Date,
    completionKey: { type: String }, // idempotency key of the completing request
    version: { type: Number, default: 1 },
    corrections: [
      {
        field: String,
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed,
        reason: String,
        requestedBy: { type: ObjectId, ref: 'User' },
        requestedAt: Date,
        status: { type: String, enum: ['REQUESTED', 'APPLIED', 'REJECTED'] },
        reviewedBy: { type: ObjectId, ref: 'User' },
        reviewedAt: Date,
      },
    ],
  },
  { timestamps: true }
);

healthVisitSchema.index({ parentId: 1, completedAt: -1 });
healthVisitSchema.index({ assistantId: 1, startedAt: -1 });

module.exports = mongoose.model('HealthVisit', healthVisitSchema);
