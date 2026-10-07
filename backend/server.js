require('dotenv').config();
const http = require('http');
const { env } = require('./src/config/env');
const { logger } = require('./src/config/logger');
const { connectDB, disconnectDB } = require('./src/config/db');
const { redis } = require('./src/config/redis');
const { createApp } = require('./src/app');
const { initSocket } = require('./src/sockets');
const { startWorkers, scheduleRepeatables, closeQueues } = require('./src/jobs/queues');

async function main() {
  await connectDB();
  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);

  await scheduleRepeatables();
  if (env.RUN_WORKERS) startWorkers();

  server.listen(env.PORT, () => logger.info(`API listening on :${env.PORT} (${env.NODE_ENV})`));

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close();
    await closeQueues();
    await disconnectDB();
    redis.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
