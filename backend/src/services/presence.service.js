const { redis } = require('../config/redis');
const { Assistant } = require('../models');
const { emitTo } = require('../sockets/emitter');
const { rooms, SOCKET_EVENTS } = require('../sockets/events');

const ONLINE_SET = 'presence:assistants:online';

async function markOnline(assistantUserId) {
  await redis.sadd(ONLINE_SET, String(assistantUserId));
  await Assistant.updateOne({ userId: assistantUserId }, { isOnline: true, lastSeenAt: new Date() });
  emitTo(rooms.admin(), SOCKET_EVENTS.ASSISTANT_PRESENCE, { assistantId: String(assistantUserId), online: true });
}

async function markOffline(assistantUserId) {
  await redis.srem(ONLINE_SET, String(assistantUserId));
  await Assistant.updateOne({ userId: assistantUserId }, { isOnline: false, lastSeenAt: new Date() });
  emitTo(rooms.admin(), SOCKET_EVENTS.ASSISTANT_PRESENCE, { assistantId: String(assistantUserId), online: false });
}

async function onlineAssistantIds() {
  return redis.smembers(ONLINE_SET);
}

module.exports = { markOnline, markOffline, onlineAssistantIds };
