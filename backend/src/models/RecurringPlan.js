const mongoose = require('mongoose');

/**
 * Recurring plan = the subscription. Bookings are materialised a rolling window ahead
 * (RECURRING_HORIZON_DAYS) by a background job, one per occurrenceIndex (idempotent).
 * Assistants are NOT pre-assigned for all future visits.
 */
const recurringPlanSchema = new mongoose.Schema(
  {
    planNumber: { type: String, required: true, unique: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', required: true },
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    frequency: { type: String, enum: ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM'], required: true },
    intervalDays: { type: Number, min: 1, max: 90 }, // CUSTOM only
    startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // local (IST) date of 1st visit
    timeOfDay: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    timezone: { type: String, default: 'Asia/Kolkata' },
    totalVisits: { type: Number, required: true, min: 1, max: 400 },
    endDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ }, // local date of last visit (admin plans)
    rebase: { index: Number, startDate: String, _id: false }, // set when admin changes schedule mid-plan: visits from `index` onward count from `startDate`
    renewedFromId: { type: mongoose.Schema.Types.ObjectId, ref: 'RecurringPlan' },
    generatedCount: { type: Number, default: 0 },
    pricePerVisit: { type: Number, required: true }, // paise (INR), after discount
    totalAmount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'], default: 'PENDING_PAYMENT' },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    preferredAssistantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    nextOccurrenceAt: Date,
    sheets: [{ serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' }, itemKeys: [String], _id: false }], // child items ticked by admin for this client
    notes: String,
    createdByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    alerts: { expiring: Date, ended: Date }, // expiry reminders already sent to the customer
    cancellation: { by: mongoose.Schema.Types.ObjectId, reason: String, at: Date },
  },
  { timestamps: true }
);

recurringPlanSchema.index({ customerId: 1, status: 1 });
recurringPlanSchema.index({ status: 1, nextOccurrenceAt: 1 });
recurringPlanSchema.index({ parentId: 1 });

module.exports = mongoose.model('RecurringPlan', recurringPlanSchema);
