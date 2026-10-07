const { Queue } = require('bullmq');
const { env } = require('../config/env');
const { logger } = require('../config/logger');
const { createQueueConnection } = require('../config/redis');

const QUEUE_NAMES = Object.freeze({
  PUSH: 'push-notifications',
  REPORTS: 'report-generation',
  SCHEDULER: 'scheduler', 
});

const DEFAULT_JOB_OPTS = { attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 };

let connection = null;
const queues = {};
let workers = [];

function getConnection() {
  if (!connection) connection = createQueueConnection();
  return connection;
}

function getQueue(name) {
  if (!queues[name]) queues[name] = new Queue(name, { connection: getConnection(), defaultJobOptions: DEFAULT_JOB_OPTS });
  return queues[name];
}

async function enqueue(name, jobName, data, opts = {}) {
  if (env.isTest) return null;
  return getQueue(name).add(jobName, data, opts);
}

async function scheduleRepeatables() {
  if (env.isTest) return;
  const q = getQueue(QUEUE_NAMES.SCHEDULER);
  await q.upsertJobScheduler('recurring-generate', { every: 60 * 60 * 1000 }, { name: 'recurring-generate' });
  await q.upsertJobScheduler('booking-reminders', { every: 5 * 60 * 1000 }, { name: 'booking-reminders' });
  await q.upsertJobScheduler('trip-watch', { every: 2 * 60 * 1000 }, { name: 'trip-watch' });
  await q.upsertJobScheduler('stale-payment-cleanup', { every: 30 * 60 * 1000 }, { name: 'stale-payment-cleanup' });
  await q.upsertJobScheduler('data-retention', { every: 24 * 60 * 60 * 1000 }, { name: 'data-retention' });
  logger.info('Repeatable jobs scheduled');
}

function startWorkers() {
  // lazy require avoids circular imports (workers depend on services that enqueue)
  const { createWorkers } = require('./workers');
  workers = createWorkers(getConnection());
  logger.info(`Started ${workers.length} BullMQ workers`);
}

async function closeQueues() {
  await Promise.allSettled([...workers.map((w) => w.close()), ...Object.values(queues).map((q) => q.close())]);
}

module.exports = { QUEUE_NAMES, getQueue, enqueue, scheduleRepeatables, startWorkers, closeQueues };
