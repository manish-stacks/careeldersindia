/**
 * Thin emit facade so services never touch Socket.IO directly.
 * API process: backed by io server. Worker process: backed by @socket.io/redis-emitter.
 */
const { logger } = require('../config/logger');

let target = null;

function setEmitTarget(t) {
  target = t;
}

function emitTo(roomList, event, payload) {
  if (!target) return;
  const list = (Array.isArray(roomList) ? roomList : [roomList]).filter(Boolean);
  if (!list.length) return;
  try {
    target.to(list).emit(event, { event, at: new Date().toISOString(), ...payload });
  } catch (err) {
    logger.warn({ err: err.message, event }, 'Socket emit failed');
  }
}

module.exports = { setEmitTarget, emitTo };
