/**
 * Razorpay flow:
 *   create booking/plan → createOrder → checkout on device → (a) webhook  (b) client verify
 * Both (a) and (b) end in markCaptured(), which is idempotent. Client callback alone is never trusted:
 * verify() checks the signature AND re-fetches the payment from Razorpay's API server-side.
 */
const crypto = require('crypto');
const { Payment, PaymentTransaction, Refund, Booking, RecurringPlan, User } = require('../models');
const { nextNumber } = require('../models/Counter');
const { ApiError } = require('../utils/ApiError');
const { safeEqual } = require('../utils/crypto');
const { parsePagination, pageMeta } = require('../utils/pagination');
const { env } = require('../config/env');
const { logger } = require('../config/logger');
const { getRazorpay } = require('../config/razorpay');
const { BOOKING_STATUS: S, PAYMENT_STATUS: P, FAMILY_PERMISSIONS, ROLES } = require('../config/constants');
const access = require('./access.service');
const notifications = require('./notification.service');
const { audit } = require('./audit.service');
const { emitTo } = require('../sockets/emitter');
const { rooms, SOCKET_EVENTS } = require('../sockets/events');

async function resolveTarget(user, { bookingId, recurringPlanId }) {
  if (bookingId) {
    const booking = await Booking.findById(bookingId);
    if (!booking) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
    if (String(booking.customerId) !== user.id) {
      const m = await access.getMembership(user.id, booking.parentId);
      if (!m?.permissions.includes(FAMILY_PERMISSIONS.BOOK)) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
    }
    if (booking.status !== S.PENDING_PAYMENT) throw ApiError.conflict('This booking does not need payment', 'PAYMENT_NOT_REQUIRED');
    if (booking.scheduledAt < new Date()) throw ApiError.conflict('This visit time has passed. Please book a new slot.', 'BOOKING_EXPIRED');
    return { purpose: 'BOOKING', amount: booking.price.amount, currency: booking.price.currency, bookingId: booking._id, label: booking.bookingNumber };
  }
  const plan = await RecurringPlan.findById(recurringPlanId);
  if (!plan || String(plan.customerId) !== user.id) throw ApiError.notFound('Plan not found', 'PLAN_NOT_FOUND');
  if (plan.status !== 'PENDING_PAYMENT') throw ApiError.conflict('This plan does not need payment', 'PAYMENT_NOT_REQUIRED');
  return { purpose: 'RECURRING_PLAN', amount: plan.totalAmount, currency: plan.currency, recurringPlanId: plan._id, label: plan.planNumber };
}

async function createOrder(user, input, req) {
  const target = await resolveTarget(user, input);
  const razorpay = getRazorpay();

  // Reuse an open order for the same target & amount (user retried checkout)
  const existing = await Payment.findOne({
    customerId: user.id,
    status: { $in: [P.CREATED, P.FAILED] },
    ...(target.bookingId ? { bookingId: target.bookingId } : { recurringPlanId: target.recurringPlanId }),
    amount: target.amount,
  });

  let payment = existing;
  if (!payment) {
    payment = await Payment.create({
      receiptNumber: await nextNumber('RCPT'),
      customerId: user.id,
      purpose: target.purpose,
      bookingId: target.bookingId,
      recurringPlanId: target.recurringPlanId,
      amount: target.amount,
      currency: target.currency,
    });
  }
  if (!payment.razorpay?.orderId || payment.status === P.FAILED) {
    const order = await razorpay.orders.create({
      amount: payment.amount,
      currency: payment.currency,
      receipt: payment.receiptNumber,
      notes: { paymentId: String(payment._id), purpose: target.purpose, ref: target.label },
    });
    payment.razorpay = { orderId: order.id };
    payment.status = P.CREATED;
    await payment.save();
  }
  if (target.bookingId) await Booking.updateOne({ _id: target.bookingId }, { paymentId: payment._id });
  if (target.recurringPlanId) await RecurringPlan.updateOne({ _id: target.recurringPlanId }, { paymentId: payment._id });

  const customer = await User.findById(user.id).select('name email mobile').lean();
  await audit({ actor: user, action: 'PAYMENT_ORDER_CREATED', entityType: 'Payment', entityId: payment._id, metadata: { amount: payment.amount }, req });
  return {
    paymentId: payment._id,
    keyId: env.RAZORPAY_KEY_ID,
    orderId: payment.razorpay.orderId,
    amount: payment.amount,
    currency: payment.currency,
    description: target.label,
    prefill: { name: customer.name, email: customer.email, contact: customer.mobile },
  };
}

function verifyCheckoutSignature(orderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
}

/** Client-side callback. Signature + server-side fetch → then the same idempotent capture path as the webhook. */
async function verifyClient(user, { razorpay_order_id: orderId, razorpay_payment_id: gatewayPaymentId, razorpay_signature: signature }) {
  const payment = await Payment.findOne({ 'razorpay.orderId': orderId, customerId: user.id });
  if (!payment) throw ApiError.notFound('Payment not found', 'PAYMENT_NOT_FOUND');
  if (payment.status === P.CAPTURED) return { status: P.CAPTURED, paymentId: payment._id };
  if (!verifyCheckoutSignature(orderId, gatewayPaymentId, signature)) throw ApiError.badRequest('Payment signature mismatch', 'INVALID_SIGNATURE');

  const razorpay = getRazorpay();
  let gp = await razorpay.payments.fetch(gatewayPaymentId);
  if (gp.order_id !== orderId) throw ApiError.badRequest('Payment does not belong to this order', 'ORDER_MISMATCH');
  if (gp.status === 'authorized') gp = await razorpay.payments.capture(gatewayPaymentId, payment.amount, payment.currency);
  if (gp.status === 'captured') {
    await markCaptured({ orderId, gatewayPaymentId, amount: gp.amount, method: gp.method, source: 'CLIENT_VERIFY', eventKey: `verify:${gatewayPaymentId}` });
    return { status: P.CAPTURED, paymentId: payment._id };
  }
  return { status: gp.status === 'failed' ? P.FAILED : P.AUTHORIZED, paymentId: payment._id, pending: true };
}

async function handleWebhook(rawBody, signature, eventIdHeader) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) throw new ApiError(503, 'Webhook not configured', 'WEBHOOK_NOT_CONFIGURED');
  const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  if (!signature || !safeEqual(expected, signature)) throw ApiError.badRequest('Invalid webhook signature', 'INVALID_SIGNATURE');

  const body = JSON.parse(rawBody.toString('utf8'));
  const event = body.event;
  const entity = body.payload?.payment?.entity;
  const eventKey = `wh:${eventIdHeader || `${event}:${entity?.id || body.payload?.refund?.entity?.id}`}`;

  switch (event) {
    case 'payment.captured':
    case 'order.paid':
      await markCaptured({ orderId: entity.order_id, gatewayPaymentId: entity.id, amount: entity.amount, method: entity.method, source: 'WEBHOOK', eventKey });
      break;
    case 'payment.failed':
      await markFailed({ orderId: entity.order_id, gatewayPaymentId: entity.id, reason: entity.error_description, eventKey });
      break;
    case 'refund.processed':
    case 'refund.failed': {
      const r = body.payload.refund.entity;
      await Refund.updateOne({ razorpayRefundId: r.id }, { status: event === 'refund.processed' ? 'PROCESSED' : 'FAILED' });
      break;
    }
    default:
      logger.debug({ event }, 'Unhandled Razorpay webhook event');
  }
}

/** Records a ledger row; returns false if this event was already processed. */
async function recordTransaction(row) {
  try {
    await PaymentTransaction.create(row);
    return true;
  } catch (err) {
    if (err.code === 11000) return false;
    throw err;
  }
}

async function markCaptured({ orderId, gatewayPaymentId, amount, method, source, eventKey }) {
  const payment = await Payment.findOne({ 'razorpay.orderId': orderId });
  if (!payment) {
    logger.warn({ orderId }, 'Capture for unknown order');
    return null;
  }
  const fresh = await recordTransaction({ paymentId: payment._id, eventKey, event: 'captured', source, amount, status: 'captured', gatewayPaymentId });
  if (!fresh) return payment;

  if (amount !== payment.amount) {
    logger.error({ paymentId: String(payment._id), expected: payment.amount, got: amount }, 'Amount mismatch on capture');
    await notifications.notifyAdmins({ type: notifications.TYPES.PAYMENT_ISSUE, title: 'Payment amount mismatch', body: `${payment.receiptNumber}: expected ${payment.amount}, got ${amount}`, data: { paymentId: String(payment._id) } });
    return payment;
  }

  // Atomic first-writer-wins: only one of (webhook, verify) performs the confirmation side-effects
  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: [P.CREATED, P.AUTHORIZED, P.FAILED] } },
    { status: P.CAPTURED, 'razorpay.paymentId': gatewayPaymentId, method, capturedAt: new Date(), failureReason: null },
    { new: true }
  );
  if (!updated) return payment;

  await audit({ actor: 'SYSTEM', action: 'PAYMENT_CAPTURED', entityType: 'Payment', entityId: updated._id, metadata: { source, amount } });

  try {
    if (updated.purpose === 'BOOKING') {
      const booking = await Booking.findById(updated.bookingId).select('status');
      if (booking?.status === S.PENDING_PAYMENT) {
        await require('./booking.service').confirmAfterPayment(updated.bookingId, updated._id);
      } else {
        // Paid after the booking expired/cancelled → refund automatically
        await refundPayment(updated._id, { amount: updated.amount, reason: 'Payment received for an expired booking', actor: 'SYSTEM' });
      }
    } else {
      const plan = await require('./recurring.service').activateAfterPayment(updated.recurringPlanId, updated._id);
      if (!plan) await refundPayment(updated._id, { amount: updated.amount, reason: 'Payment received for an inactive plan', actor: 'SYSTEM' });
    }
  } catch (err) {
    logger.error({ err, paymentId: String(updated._id) }, 'Post-capture confirmation failed');
    await notifications.notifyAdmins({ type: notifications.TYPES.PAYMENT_ISSUE, title: 'Payment captured but confirmation failed', body: `${updated.receiptNumber} needs manual review`, data: { paymentId: String(updated._id) } });
  }

  await notifications.notify({ userIds: updated.customerId, type: notifications.TYPES.PAYMENT_SUCCESS, title: 'Payment successful', body: `We received $${(updated.amount / 100).toFixed(2)} (${updated.receiptNumber}).`, data: { paymentId: String(updated._id) } });
  emitTo([rooms.customer(String(updated.customerId)), rooms.admin()], SOCKET_EVENTS.PAYMENT_UPDATED, { paymentId: String(updated._id), status: updated.status });
  return updated;
}

async function markFailed({ orderId, gatewayPaymentId, reason, eventKey }) {
  const payment = await Payment.findOne({ 'razorpay.orderId': orderId });
  if (!payment) return;
  const fresh = await recordTransaction({ paymentId: payment._id, eventKey, event: 'failed', source: 'WEBHOOK', status: 'failed', gatewayPaymentId });
  if (!fresh) return;
  const updated = await Payment.findOneAndUpdate({ _id: payment._id, status: { $in: [P.CREATED, P.AUTHORIZED] } }, { status: P.FAILED, failureReason: reason?.slice(0, 300) }, { new: true });
  if (!updated) return;
  await notifications.notify({ userIds: updated.customerId, type: notifications.TYPES.PAYMENT_FAILED, title: 'Payment failed', body: 'Your payment did not go through. You can retry from the booking.', data: { paymentId: String(updated._id), bookingId: updated.bookingId ? String(updated.bookingId) : undefined } });
  emitTo(rooms.customer(String(updated.customerId)), SOCKET_EVENTS.PAYMENT_UPDATED, { paymentId: String(updated._id), status: updated.status });
}

/**
 * Refund (full or partial). If there is no gateway payment (e.g. seed / offline payment),
 * a PENDING refund is recorded for finance to process manually.
 */
async function refundPayment(paymentId, { amount, reason, actor }) {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw ApiError.notFound('Payment not found', 'PAYMENT_NOT_FOUND');
  if (![P.CAPTURED, P.PARTIALLY_REFUNDED].includes(payment.status)) throw ApiError.conflict('Only captured payments can be refunded', 'NOT_REFUNDABLE');
  const refundable = payment.amount - payment.refundedAmount;
  const value = Math.min(amount ?? refundable, refundable);
  if (value <= 0) throw ApiError.conflict('Nothing left to refund', 'NOTHING_TO_REFUND');

  const refund = await Refund.create({ paymentId: payment._id, bookingId: payment.bookingId, amount: value, reason, createdBy: actor === 'SYSTEM' ? undefined : actor?.id });
  if (payment.razorpay?.paymentId && env.RAZORPAY_KEY_ID) {
    try {
      const r = await getRazorpay().payments.refund(payment.razorpay.paymentId, { amount: value, notes: { reason: reason?.slice(0, 200) || '' } });
      refund.razorpayRefundId = r.id;
      refund.status = r.status === 'processed' ? 'PROCESSED' : 'PENDING';
    } catch (err) {
      refund.status = 'FAILED';
      await refund.save();
      throw ApiError.badRequest(`Refund failed: ${err.error?.description || err.message}`, 'REFUND_FAILED');
    }
  }
  await refund.save();

  payment.refundedAmount += value;
  payment.status = payment.refundedAmount >= payment.amount ? P.REFUNDED : P.PARTIALLY_REFUNDED;
  await payment.save();
  if (payment.bookingId) {
    await Booking.updateOne({ _id: payment.bookingId }, { paymentStatus: payment.status === P.REFUNDED ? 'REFUNDED' : 'PARTIALLY_REFUNDED' });
  }
  await audit({ actor: actor || 'SYSTEM', action: 'PAYMENT_REFUNDED', entityType: 'Payment', entityId: payment._id, metadata: { amount: value, reason, refundId: String(refund._id) } });
  return refund;
}

async function refundForBooking(booking, { reason, actor }) {
  if (!booking.paymentId) return null;
  const refund = await refundPayment(booking.paymentId, { amount: booking.price.amount, reason: `${booking.bookingNumber}: ${reason}`, actor });
  if (booking.paymentStatus === 'PREPAID_PLAN') await Booking.updateOne({ _id: booking._id }, { paymentStatus: 'REFUNDED' });
  return refund;
}

async function listForUser(user, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = user.role === ROLES.ADMIN ? {} : { customerId: user.id };
  if (query.status) filter.status = query.status;
  if (query.purpose) filter.purpose = query.purpose;
  if (user.role === ROLES.ADMIN) {
    if (query.customerId) filter.customerId = query.customerId;
    if (query.method) filter.method = query.method;
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) filter.createdAt.$gte = new Date(`${query.from}T00:00:00+05:30`);
      if (query.to) filter.createdAt.$lte = new Date(`${query.to}T23:59:59+05:30`);
    }
    if (query.q) {
      const rx = new RegExp(String(query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 60), 'i');
      const users = await User.find({ role: ROLES.CUSTOMER, $or: [{ name: rx }, { email: rx }] }).select('_id').limit(200).lean();
      filter.$or = [{ receiptNumber: rx }, { reference: rx }, { customerId: { $in: users.map((u) => u._id) } }];
    }
  }
  const [items, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('customerId', 'name email').populate('bookingId', 'bookingNumber').populate('recurringPlanId', 'planNumber').lean(),
    Payment.countDocuments(filter),
  ]);
  return { items, meta: pageMeta({ page, limit }, total) };
}

async function getForUser(user, paymentId) {
  const payment = await Payment.findById(paymentId).populate('bookingId', 'bookingNumber scheduledAt').populate('recurringPlanId', 'planNumber').lean();
  if (!payment || (user.role !== ROLES.ADMIN && String(payment.customerId) !== user.id)) throw ApiError.notFound('Payment not found', 'PAYMENT_NOT_FOUND');
  const [refunds, transactions] = await Promise.all([
    Refund.find({ paymentId }).sort({ createdAt: -1 }).lean(),
    user.role === ROLES.ADMIN ? PaymentTransaction.find({ paymentId }).sort({ createdAt: -1 }).select('-meta').lean() : [],
  ]);
  return { ...payment, refunds, transactions };
}

/** Expire unpaid bookings/plans so slots don't stay blocked. */
async function expireStalePending() {
  const cutoff = new Date(Date.now() - 2 * 3600000);
  const stale = await Booking.find({ status: S.PENDING_PAYMENT, $or: [{ createdAt: { $lt: cutoff } }, { scheduledAt: { $lt: new Date() } }] }).select('_id').limit(500);
  const sm = require('./bookingStateMachine');
  let n = 0;
  for (const b of stale) {
    try {
      await sm.transition(b._id, S.CANCELLED_BY_ADMIN, { actor: 'SYSTEM', note: 'Payment not completed in time', set: { cancellation: { role: 'SYSTEM', reason: 'Payment not completed', at: new Date() } }, expectedFrom: S.PENDING_PAYMENT });
      n += 1;
    } catch {
      /* already moved on */
    }
  }
  const planRes = await RecurringPlan.updateMany({ status: 'PENDING_PAYMENT', createdAt: { $lt: new Date(Date.now() - 24 * 3600000) } }, { status: 'CANCELLED', cancellation: { reason: 'Payment not completed', at: new Date() } });
  return { bookings: n, plans: planRes.modifiedCount };
}


const EDIT_STATUSES = [P.CREATED, P.CAPTURED, P.FAILED];

/** Admin edits payment details. Gateway-captured payments keep amount/status locked; method, reference and note are always editable. */
async function adminUpdatePayment(admin, paymentId, input, req) {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw ApiError.notFound('Payment not found', 'PAYMENT_NOT_FOUND');
  const gateway = !payment.manual && !!payment.razorpay?.paymentId;
  for (const k of ['method', 'reference', 'note']) if (input[k] !== undefined) payment[k] = input[k];
  const wantsMoney = input.amount !== undefined || input.status !== undefined || input.capturedAt !== undefined;
  if (wantsMoney && gateway) throw ApiError.conflict('This payment was captured by the gateway. Only method, reference and note can be edited.', 'PAYMENT_LOCKED');
  if (wantsMoney && (payment.refundedAmount || 0) > 0) throw ApiError.conflict('Refunded payments cannot be edited', 'PAYMENT_LOCKED');
  if (input.amount !== undefined) payment.amount = input.amount;
  if (input.status !== undefined) {
    if (!EDIT_STATUSES.includes(input.status)) throw ApiError.badRequest('Status must be CREATED, CAPTURED or FAILED', 'BAD_STATUS');
    payment.status = input.status;
    if (input.status === P.CAPTURED && !payment.capturedAt) payment.capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();
  }
  if (input.capturedAt !== undefined && input.capturedAt) payment.capturedAt = new Date(input.capturedAt);
  payment.manual = payment.manual || !gateway;
  payment.updatedByAdmin = admin.id;
  await payment.save();
  if (payment.recurringPlanId && payment.status === P.CAPTURED) {
    const recurring = require('./recurring.service');
    await RecurringPlan.updateOne({ _id: payment.recurringPlanId }, { totalAmount: payment.amount }).catch(() => {});
    await recurring.activateAfterPayment(payment.recurringPlanId, payment._id).catch(() => null);
  }
  await audit({ actor: admin, action: 'ADMIN_PAYMENT_UPDATED', entityType: 'Payment', entityId: payment._id, metadata: { fields: Object.keys(input) }, req });
  return payment;
}

/** Create-or-update the (offline) payment record of a plan sold by the admin. */
async function adminSavePlanPayment(admin, planId, input, req) {
  const plan = await RecurringPlan.findById(planId);
  if (!plan) throw ApiError.notFound('Plan not found', 'PLAN_NOT_FOUND');
  if (plan.paymentId) return adminUpdatePayment(admin, plan.paymentId, input, req);
  const payment = await Payment.create({
    receiptNumber: await nextNumber('RCPT'), customerId: plan.customerId, purpose: 'RECURRING_PLAN', recurringPlanId: plan._id,
    amount: input.amount ?? plan.totalAmount, currency: plan.currency, status: input.status || P.CAPTURED,
    method: input.method, reference: input.reference, note: input.note, manual: true, updatedByAdmin: admin.id,
    capturedAt: (input.status || P.CAPTURED) === P.CAPTURED ? (input.capturedAt ? new Date(input.capturedAt) : new Date()) : undefined,
  });
  plan.paymentId = payment._id;
  await plan.save();
  if (payment.status === P.CAPTURED && plan.status === 'PENDING_PAYMENT') await require('./recurring.service').activateAfterPayment(plan._id, payment._id).catch(() => null);
  await audit({ actor: admin, action: 'ADMIN_PAYMENT_RECORDED', entityType: 'Payment', entityId: payment._id, metadata: { planNumber: plan.planNumber }, req });
  return payment;
}

module.exports = { adminUpdatePayment, adminSavePlanPayment, createOrder, verifyClient, handleWebhook, markCaptured, markFailed, refundPayment, refundForBooking, listForUser, getForUser, expireStalePending, verifyCheckoutSignature };
