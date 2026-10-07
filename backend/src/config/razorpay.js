const Razorpay = require('razorpay');
const { env } = require('./env');
const { ApiError } = require('../utils/ApiError');

let client = null;
function getRazorpay() {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new ApiError(503, 'Payments are not configured', 'PAYMENTS_NOT_CONFIGURED');
  }
  if (!client) client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  return client;
}

module.exports = { getRazorpay };
