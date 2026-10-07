const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema(
  {
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    amount: { type: Number, required: true },
    reason: String,
    razorpayRefundId: String,
    status: { type: String, enum: ['PENDING', 'PROCESSED', 'FAILED'], default: 'PENDING' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Refund', refundSchema);
