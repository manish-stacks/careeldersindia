const mongoose = require('mongoose');
const { env } = require('./env');
const { logger } = require('./logger');

const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);

mongoose.set('strictQuery', true);
async function connectDB(uri = env.MONGO_URI) {
  await mongoose.connect(uri, { autoIndex: !env.isProd, maxPoolSize: 20 });
  logger.info('MongoDB connected');
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB, mongoose };
