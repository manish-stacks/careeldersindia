// Standalone worker process (set RUN_WORKERS=false on API instances when using this).
require('dotenv').config();
const { logger } = require('./src/config/logger');
const { connectDB } = require('./src/config/db');
const { startWorkers, scheduleRepeatables } = require('./src/jobs/queues');
const { initEmitterOnly } = require('./src/sockets');

(async () => {
  await connectDB();
  initEmitterOnly();
  await scheduleRepeatables();
  startWorkers();
  logger.info('Workers running');
})().catch((err) => {
  logger.fatal({ err }, 'Worker failed');
  process.exit(1);
});
