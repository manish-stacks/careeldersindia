const Redis = require('ioredis');
const { env } = require('./env');
const { logger } = require('./logger');

function createRedisClient(opts = {}) {
  const client = new Redis(env.REDIS_URL, opts);
  client.on('error', (err) => logger.error({ err: err.message }, 'Redis error'));
  return client;
}

// General purpose client (cache, locks, OTP, location, presence, rate limit)
const redis = createRedisClient({ maxRetriesPerRequest: 3 });

// BullMQ requires maxRetriesPerRequest: null
function createQueueConnection() {
  return createRedisClient({ maxRetriesPerRequest: null });
}

/** Distributed lock. Returns release fn, or null if already held. */
async function acquireLock(key, ttlMs = 10000) {
  const token = `${Date.now()}-${Math.random()}`;
  const ok = await redis.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
  if (!ok) return null;
  return async () => {
    const script = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
    await redis.eval(script, 1, `lock:${key}`, token);
  };
}

module.exports = { redis, createRedisClient, createQueueConnection, acquireLock };
