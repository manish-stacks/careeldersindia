const { asyncHandler } = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const { ApiError } = require('../utils/ApiError');
const paymentService = require('../services/payment.service');

module.exports = {
  createOrder: asyncHandler(async (req, res) => created(res, await paymentService.createOrder(req.user, req.body, req), 'Order created')),
  verify: asyncHandler(async (req, res) => ok(res, await paymentService.verifyClient(req.user, req.body), 'Payment verified')),
  list: asyncHandler(async (req, res) => {
    const { items, meta } = await paymentService.listForUser(req.user, req.query);
    return ok(res, items, 'OK', 200, meta);
  }),
  get: asyncHandler(async (req, res) => ok(res, await paymentService.getForUser(req.user, req.params.id))),

  /** Razorpay webhook — raw body for signature verification. 2xx on handled/duplicate so Razorpay stops retrying. */
  webhook: asyncHandler(async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature || !Buffer.isBuffer(req.body)) throw ApiError.badRequest('Invalid webhook', 'INVALID_WEBHOOK');
    const result = await paymentService.handleWebhook(req.body, signature, req.headers['x-razorpay-event-id']);
    return res.status(200).json({ success: true, ...(result || {}) });
  }),
};
