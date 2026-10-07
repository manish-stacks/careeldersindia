const mongoose = require('mongoose');

// Ledger of gateway events (webhooks / verify calls). eventKey enforces idempotency.
const paymentTransactionSchema = new mongoose.Schema(
  {
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', index: true },
    eventKey: { type: String, required: true, unique: true },
    event: String,
    source: { type: String, enum: ['WEBHOOK', 'CLIENT_VERIFY', 'ADMIN', 'SYSTEM'] },
    amount: Number,
    status: String,
    gatewayPaymentId: String,
    meta: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

module.exports = mongoose.model('PaymentTransaction', paymentTransactionSchema);
