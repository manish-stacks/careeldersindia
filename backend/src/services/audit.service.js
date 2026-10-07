const { AuditLog } = require('../models');
const { logger } = require('../config/logger');

/**
 * Append-only audit trail. Never throws — auditing must not break the business action.
 * actor: req.user | { id, role } | 'SYSTEM'
 */
async function audit({ actor, action, entityType, entityId, metadata = {}, req }) {
  try {
    const isSystem = !actor || actor === 'SYSTEM';
    await AuditLog.create({
      actorId: isSystem ? undefined : actor.id || actor._id,
      actorRole: isSystem ? 'SYSTEM' : actor.role,
      action,
      entityType,
      entityId,
      metadata,
      ip: req?.ip,
      requestId: req?.id,
    });
  } catch (err) {
    logger.error({ err: err.message, action }, 'Audit log write failed');
  }
}

module.exports = { audit };
