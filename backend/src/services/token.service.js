const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { env } = require('../config/env');
const { RefreshToken } = require('../models');
const { ApiError } = require('../utils/ApiError');
const { sha256, randomToken } = require('../utils/crypto');

function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
    issuer: 'careeldersindia',
    audience: 'careeldersindia-api',
  });
}

/**
 * Trip token: lets the phone's background location task post GPS for ONE booking without a user session.
 * Different audience → rejected by normal API auth. Expires; server also stops accepting once the trip ends.
 */
function signTripToken({ assistantId, bookingId }) {
  const expiresIn = env.TRIP_TOKEN_TTL_HOURS * 3600;
  const token = jwt.sign({ sub: String(assistantId), bid: String(bookingId), typ: 'trip' }, env.JWT_ACCESS_SECRET, { expiresIn, issuer: 'careeldersindia', audience: 'careeldersindia-trip' });
  return { token, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
}

function verifyTripToken(token) {
  try {
    const p = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'careeldersindia', audience: 'careeldersindia-trip' });
    if (p.typ !== 'trip') throw new Error('wrong type');
    return { assistantId: p.sub, bookingId: p.bid };
  } catch {
    throw ApiError.unauthorized('Trip link expired', 'TRIP_TOKEN_INVALID');
  }
}

async function issueRefreshToken(user, { family, userAgent, ip } = {}) {
  const raw = `${randomToken(48)}.${crypto.randomUUID()}`;
  const doc = await RefreshToken.create({
    userId: user._id,
    tokenHash: sha256(`${env.JWT_REFRESH_SECRET}:${raw}`),
    family: family || crypto.randomUUID(),
    expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86400000),
    userAgent: userAgent?.slice(0, 200),
    ip,
  });
  return { raw, doc };
}

async function issueTokenPair(user, ctx) {
  const accessToken = signAccessToken(user);
  const { raw } = await issueRefreshToken(user, ctx);
  return { accessToken, refreshToken: raw };
}

/** Rotate refresh token. Reuse of a revoked token revokes the whole family (theft signal). */
async function rotateRefreshToken(raw, ctx = {}) {
  if (!raw) throw ApiError.unauthorized('Refresh token required', 'REFRESH_REQUIRED');
  const tokenHash = sha256(`${env.JWT_REFRESH_SECRET}:${raw}`);
  const existing = await RefreshToken.findOne({ tokenHash });
  if (!existing || existing.expiresAt < new Date()) throw ApiError.unauthorized('Session expired', 'REFRESH_INVALID');

  if (existing.revokedAt) {
    await RefreshToken.updateMany({ family: existing.family, revokedAt: null }, { revokedAt: new Date() });
    throw ApiError.unauthorized('Session revoked, please log in again', 'REFRESH_REUSED');
  }

  const { User } = require('../models');
  const user = await User.findById(existing.userId).select('role status name email mobile adminRole');
  if (!user || user.status !== 'ACTIVE') throw ApiError.unauthorized('Account is not active', 'ACCOUNT_INACTIVE');

  const { raw: nextRaw, doc } = await issueRefreshToken(user, { family: existing.family, ...ctx });
  existing.revokedAt = new Date();
  existing.replacedByHash = doc.tokenHash;
  await existing.save();

  return { user, accessToken: signAccessToken(user), refreshToken: nextRaw };
}

async function revokeRefreshToken(raw) {
  if (!raw) return;
  const tokenHash = sha256(`${env.JWT_REFRESH_SECRET}:${raw}`);
  const existing = await RefreshToken.findOne({ tokenHash });
  if (existing) await RefreshToken.updateMany({ family: existing.family, revokedAt: null }, { revokedAt: new Date() });
}

async function revokeAllForUser(userId) {
  await RefreshToken.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });
}

module.exports = {
  signTripToken,
  verifyTripToken, signAccessToken, issueTokenPair, rotateRefreshToken, revokeRefreshToken, revokeAllForUser };
