const { env } = require('../config/env');
const { asyncHandler } = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { ApiError } = require('../utils/ApiError');
const { User } = require('../models');
const { ROLES } = require('../config/constants');
const authService = require('../services/auth.service');
const tokenService = require('../services/token.service');
const { audit } = require('../services/audit.service');
const { adminAccess } = require('../middleware/auth');

const COOKIE = 'pc_rt';
const cookieOpts = () => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAMESITE,
  domain: env.COOKIE_DOMAIN || undefined,
  path: '/api/v1/auth',
  maxAge: env.JWT_REFRESH_TTL_DAYS * 86400000,
});
const clearOpts = () => {
  const { maxAge, ...rest } = cookieOpts(); // eslint-disable-line no-unused-vars
  return rest;
};
const ctx = (req) => ({ userAgent: req.headers['user-agent'], ip: req.ip, req });
const publicUser = (u) => ({ _id: u._id, name: u.name, email: u.email, mobile: u.mobile, role: u.role, country: u.country, timezone: u.timezone, status: u.status });

/** Admin web keeps refresh token in an httpOnly cookie; mobile keeps it in SecureStore (body). */
async function withAccess(u) {
  const base = publicUser(u);
  if (u.role !== ROLES.ADMIN) return base;
  return { ...base, ...(await adminAccess(u)) };
}

// Website requests (portal ADMIN/WEB, or a refresh made with the cookie) get the httpOnly cookie; the mobile app gets the token in the body.
const isWebReq = (req) => ['ADMIN', 'WEB'].includes(req?.body?.portal) || (!req?.body?.refreshToken && !!req?.cookies?.[COOKIE]);

async function respondWithSession(res, { user, accessToken, refreshToken }, statusCode = 200, req = null) {
  const isWeb = user.role === ROLES.ADMIN || isWebReq(req);
  if (isWeb) res.cookie(COOKIE, refreshToken, cookieOpts());
  return ok(res, { user: await withAccess(user), accessToken, ...(isWeb ? {} : { refreshToken }) }, 'Signed in', statusCode);
}

module.exports = {
  registerCustomer: asyncHandler(async (req, res) => respondWithSession(res, await authService.registerCustomer(req.body, ctx(req)), 201, req)),
  registerAssistant: asyncHandler(async (req, res) => respondWithSession(res, await authService.registerAssistant(req.body, ctx(req)), 201, req)),
  login: asyncHandler(async (req, res) => respondWithSession(res, await authService.login(req.body, ctx(req)), 200, req)),

  refresh: asyncHandler(async (req, res) => {
    const raw = req.body?.refreshToken || req.cookies?.[COOKIE];
    try {
      return respondWithSession(res, await tokenService.rotateRefreshToken(raw, { userAgent: req.headers['user-agent'], ip: req.ip }), 200, req);
    } catch (err) {
      res.clearCookie(COOKIE, clearOpts());
      throw err;
    }
  }),

  logout: asyncHandler(async (req, res) => {
    await tokenService.revokeRefreshToken(req.body?.refreshToken || req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, clearOpts());
    return ok(res, {}, 'Signed out');
  }),

  forgotPassword: asyncHandler(async (req, res) => {
    await authService.requestPasswordReset(req.body.identifier);
    return ok(res, {}, 'If an account exists, a verification code has been sent');
  }),

  resetPassword: asyncHandler(async (req, res) => {
    await authService.resetPassword(req.body);
    return ok(res, {}, 'Password updated. Please sign in.');
  }),

  changePassword: asyncHandler(async (req, res) => {
    const tokens = await authService.changePassword(req.user.id, req.body);
    await audit({ actor: req.user, action: 'PASSWORD_CHANGED', entityType: 'User', entityId: req.user.id, req });
    const user = await User.findById(req.user.id);
    return respondWithSession(res, { user, ...tokens }, 200, req);
  }),

  me: asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).lean();
    if (!user) throw ApiError.notFound('User not found');
    return ok(res, { user: await withAccess(user) });
  }),

  updateMe: asyncHandler(async (req, res) => {
    if (req.body.mobile) {
      const clash = await User.findOne({ mobile: req.body.mobile, _id: { $ne: req.user.id } }).select('_id').lean();
      if (clash) throw ApiError.conflict('Mobile number already in use', 'DUPLICATE_MOBILE');
    }
    const user = await User.findByIdAndUpdate(req.user.id, { $set: req.body }, { new: true, runValidators: true }).lean();
    return ok(res, { user: publicUser(user) }, 'Profile updated');
  }),
};
