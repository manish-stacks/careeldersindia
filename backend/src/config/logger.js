const pino = require('pino');
const { env } = require('./env');

// Redact anything that may carry secrets or health/PII data.
const redact = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'res.headers["set-cookie"]',
    '*.password',
    '*.passwordHash',
    '*.refreshToken',
    '*.accessToken',
    '*.token',
    '*.otp',
    '*.accountNumber',
    '*.panNumber',
    '*.govIdNumber',
    '*.razorpay_signature',
    '*.measurements',
  ],
  censor: '[REDACTED]',
};

const logger = pino({
  level: env.isTest ? 'silent' : env.isProd ? 'info' : 'debug',
  redact,
  transport: env.isProd || env.isTest ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
});

module.exports = { logger };
