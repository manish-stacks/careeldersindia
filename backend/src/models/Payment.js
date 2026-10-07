const mongoose = require('mongoose');
const { PAYMENT_STATUS } = require('../config/constants');

const paymentSchema = new mongoose.Schema(
  {
    receiptNumber: { type: String, required: true, unique: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: ['BOOKING', 'RECURRING_PLAN'], required: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    recurringPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'RecurringPlan' },
    amount: { type: Number, required: true }, // paise (INR)
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.CREATED },
    razorpay: { orderId: String, paymentId: String },
    method: String, // UPI, CASH, BANK_TRANSFER, CARD, RAZORPAY ...
    reference: String, // txn / UTR / cheque no
    note: String,
    manual: { type: Boolean, default: false }, // recorded by admin (offline)
    updatedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    failureReason: String,
    capturedAt: Date,
    refundedAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

paymentSchema.index({ 'razorpay.orderId': 1 }, { unique: true, sparse: true });
paymentSchema.index({ 'razorpay.paymentId': 1 }, { sparse: true });
paymentSchema.index({ customerId: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
