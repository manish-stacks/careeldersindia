const { z } = require('zod');

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  API_PUBLIC_URL: z.string().default('http://localhost:5201'),
  MONGO_URI: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex chars'),
  MEDIA_SIGNING_SECRET: z.string().min(32),
  COOKIE_SECURE: bool.default(false),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().optional().default(''),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.string().optional().default('587'),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  EMAIL_FROM: z.string().optional().default(''),
  FIREBASE_PROJECT_ID: z.string().optional().default(''),
  FIREBASE_CLIENT_EMAIL: z.string().optional().default(''),
  FIREBASE_PRIVATE_KEY: z.string().optional().default(''),
  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  STORAGE_BUCKET: z.string().optional().default(''),
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_ENDPOINT: z.string().optional().default(''),
  STORAGE_ACCESS_KEY: z.string().optional().default(''),
  STORAGE_SECRET_KEY: z.string().optional().default(''),
  CLIENT_APP_URL: z.string().default('http://localhost:8081'),
  ADMIN_APP_URL: z.string().default('http://localhost:3000'),
  RUN_WORKERS: bool.default(true),
  RECURRING_HORIZON_DAYS: z.coerce.number().default(14),
  LOCATION_HISTORY_TTL_DAYS: z.coerce.number().default(30),
  // Deep links / universal links (served at /.well-known/*)
  APP_LINK_HOST: z.string().optional().default(''),
  APPLE_TEAM_ID: z.string().optional().default(''),
  IOS_BUNDLE_ID: z.string().default('in.careeldersindia.app'),
  ANDROID_PACKAGE: z.string().default('in.careeldersindia.app'),
  ANDROID_SHA256_CERT_FINGERPRINTS: z.string().optional().default(''),
  TRIP_TOKEN_TTL_HOURS: z.coerce.number().min(1).max(24).default(12),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;
env.isProd = env.NODE_ENV === 'production';
env.isTest = env.NODE_ENV === 'test';

if (env.isProd && /^0+$/.test(env.ENCRYPTION_KEY)) {
  // eslint-disable-next-line no-console
  console.error('ENCRYPTION_KEY must not be the example value in production');
  process.exit(1);
}

module.exports = { env };
