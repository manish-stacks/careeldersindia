const { env } = require('./env');

/**
 * Checks whether an incoming HTTP Origin is allowed by CORS policy.
 * Supports:
 * - Domain with or without 'www' (careeldersindia.com, www.careeldersindia.com, and subdomains like admin.careeldersindia.com)
 * - Localhost and 127.0.0.1 on any port (e.g. 3000, 5173, 8081)
 * - Local LAN / WiFi IPs (192.168.*, 10.*, 172.16-31.*) for mobile device testing
 * - Environment configured URLs (ADMIN_APP_URL, CLIENT_APP_URL, CORS_ALLOWED_ORIGINS)
 * - Non-browser / mobile requests (empty origin, null, custom app schemes)
 */
function isOriginAllowed(origin) {
  if (!origin) return true;
  const o = String(origin).trim().replace(/\/$/, '');

  // 1. Check exact configured URLs from environment
  const extraOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const allowedExact = new Set(
    [
      env.ADMIN_APP_URL?.replace(/\/$/, ''),
      env.CLIENT_APP_URL?.replace(/\/$/, ''),
      env.API_PUBLIC_URL?.replace(/\/$/, ''),
      ...extraOrigins,
    ].filter(Boolean)
  );

  if (allowedExact.has(o)) return true;

  // 2. Allow careeldersindia.com with or without 'www', plus all subdomains (e.g. admin.careeldersindia.com)
  if (/^https?:\/\/([a-zA-Z0-9-]+\.)*careeldersindia\.com(:\d+)?$/.test(o)) {
    return true;
  }

  // 3. Allow custom host from APP_LINK_HOST if specified (with or without www)
  if (env.APP_LINK_HOST) {
    const escaped = env.APP_LINK_HOST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const customRegex = new RegExp(`^https?:\\/\\/([a-zA-Z0-9-]+\\.)*${escaped}(:\\d+)?$`);
    if (customRegex.test(o)) return true;
  }

  // 4. Local development: localhost, 127.0.0.1, LAN IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(o)) {
    return true;
  }

  // 5. Mobile app / WebView schemes
  if (o === 'null' || /^(file|exp|careeldersindia):\/\//.test(o)) {
    return true;
  }

  return false;
}

const corsOptions = {
  origin: (origin, cb) => {
    if (isOriginAllowed(origin)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-idempotency-key', 'baggage', 'sentry-trace'],
  exposedHeaders: ['x-request-id'],
};

module.exports = { isOriginAllowed, corsOptions };
