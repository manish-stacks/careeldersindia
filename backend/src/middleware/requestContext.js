const crypto = require('crypto');
const pinoHttp = require('pino-http');
const { logger } = require('../config/logger');

const requestId = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  req.id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
};

// Structured access log: requestId, userId, role, route, method, status, duration. No bodies.
const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.id,
  autoLogging: { ignore: (req) => req.url === '/health' },
  customProps: (req) => ({ userId: req.user?.id, role: req.user?.role, route: req.route?.path }),
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url?.split('?')[0] }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
});

module.exports = { requestId, httpLogger };
