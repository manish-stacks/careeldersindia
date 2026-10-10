const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { User, Role } = require('../models');
const { ALL_PERMISSIONS, expand } = require('../config/permissions');
const { ApiError } = require('../utils/ApiError');
const { asyncHandler } = require('../utils/asyncHandler');

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'careeldersindia', audience: 'careeldersindia-api' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw ApiError.unauthorized('Session expired', 'TOKEN_EXPIRED');
    throw ApiError.unauthorized('Invalid token', 'INVALID_TOKEN');
  }
}

/** Loads the user fresh from DB so suspended users / changed passwords take effect immediately. */
async function resolveUserFromToken(token) {
  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub).select('name email role status passwordChangedAt timezone adminRole').lean();
  if (!user || user.status !== 'ACTIVE') throw ApiError.unauthorized('Account is not active', 'ACCOUNT_INACTIVE');
  if (user.passwordChangedAt && payload.iat * 1000 < new Date(user.passwordChangedAt).getTime() - 1000) {
    throw ApiError.unauthorized('Password changed, please log in again', 'TOKEN_STALE');
  }
  const access = user.role === 'ADMIN' ? await adminAccess(user) : { isSuper: false, permissions: [] };
  return { id: String(user._id), _id: user._id, role: user.role, name: user.name, email: user.email, timezone: user.timezone, roleId: user.adminRole ? String(user.adminRole) : null, ...access };
}

/** Super admin (no role assigned) gets everything; otherwise the assigned role's permissions. */
async function adminAccess(user) {
  if (!user.adminRole) return { isSuper: true, permissions: ALL_PERMISSIONS };
  const role = await Role.findById(user.adminRole).select('permissions').lean();
  return { isSuper: false, permissions: expand(role?.permissions || []) };
}

const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized();
  req.user = await resolveUserFromToken(token);
  next();
});

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
  return next();
};

const requirePermission = (perm) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!req.user.permissions?.includes(perm)) return next(ApiError.forbidden('Your role does not allow this action', 'PERMISSION_DENIED'));
  return next();
};

module.exports = { authenticate, requireRole, requirePermission, adminAccess, verifyAccessToken, resolveUserFromToken };
