const { rateLimit } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { redis } = require('../config/redis');
const { env } = require('../config/env');

const store = (prefix) =>
  env.isTest ? undefined : new RedisStore({ prefix: `rl:${prefix}:`, sendCommand: (...args) => redis.call(...args) });

const json = (_req, res) => res.status(429).json({ success: false, message: 'Too many requests, slow down', code: 'RATE_LIMITED' });

const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, store: store('api'), handler: json });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, store: store('auth'), handler: json });
const otpLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, store: store('otp'), handler: json });

// background GPS: generous but bounded (per IP)
const tripLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, store: store('trip'), handler: json });

module.exports = { apiLimiter, authLimiter, otpLimiter, tripLimiter };
