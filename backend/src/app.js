const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express');
const { env } = require('./config/env');
const { redis } = require('./config/redis');
const { requestId, httpLogger } = require('./middleware/requestContext');
const { apiLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/error');
const { buildSpec } = require('./config/swagger');

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId);
  if (!env.isTest) app.use(httpLogger);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  const allowed = new Set([env.ADMIN_APP_URL, env.CLIENT_APP_URL].filter(Boolean));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || allowed.has(origin) || (!env.isProd && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))),
      credentials: true,
      exposedHeaders: ['x-request-id'],
    })
  );
  app.use(compression());

  // Razorpay webhook must see the exact raw bytes — mount BEFORE express.json()
  const { webhookHandler, router, wellKnown } = require('./routes');
  app.post('/api/v1/payments/webhook', express.raw({ type: 'application/json', limit: '1mb' }), webhookHandler);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use(mongoSanitize({ replaceWith: '_' }));

  // Universal links (iOS) + App Links (Android) + install fallback page
  app.get('/.well-known/apple-app-site-association', wellKnown.appleAppSiteAssociation);
  app.get('/.well-known/assetlinks.json', wellKnown.assetLinks);
  app.get(/^\/app(\/.*)?$/, wellKnown.appFallback);

  app.get('/health', async (_req, res) => {
    const mongo = mongoose.connection.readyState === 1;
    const redisOk = await redis.ping().then((r) => r === 'PONG').catch(() => false);
    res.status(mongo && redisOk ? 200 : 503).json({ success: mongo && redisOk, mongo, redis: redisOk, uptime: Math.round(process.uptime()) });
  });

  const spec = buildSpec();
  app.get('/api-docs.json', (_req, res) => res.json(spec));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'ParentCare API', swaggerOptions: { persistAuthorization: true } }));

  app.use('/api/v1', apiLimiter, router);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
