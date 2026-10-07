const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { User, Assistant, FamilyMember } = require('../models');
const { ApiError } = require('../utils/ApiError');
const { ROLES } = require('../config/constants');
const { redis } = require('../config/redis');
const { env } = require('../config/env');
const { logger } = require('../config/logger');
const { sha256, randomOtp, safeEqual } = require('../utils/crypto');
const tokenService = require('./token.service');
const { audit } = require('./audit.service');
const notifications = require('./notification.service');

const BCRYPT_ROUNDS = 12;
const OTP_TTL_SECONDS = 600;
const OTP_MAX_ATTEMPTS = 5;
// Used to equalise timing when the account does not exist
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);

const hashPassword = (pw) => bcrypt.hash(pw, BCRYPT_ROUNDS);

function findByIdentifier(identifier) {
  const value = String(identifier).trim().toLowerCase();
  const query = value.includes('@') ? { email: value } : { mobile: value };
  return User.findOne(query).select('+passwordHash');
}

async function assertUnique(email, mobile) {
  const or = [{ email: email.toLowerCase() }];
  if (mobile) or.push({ mobile });
  const existing = await User.findOne({ $or: or }).select('email mobile').lean();
  if (existing) {
    const field = existing.email === email.toLowerCase() ? 'Email' : 'Mobile number';
    throw ApiError.conflict(`${field} is already registered`, 'ACCOUNT_EXISTS');
  }
}

async function registerCustomer(input, ctx) {
  await assertUnique(input.email, input.mobile);
  const user = await User.create({
    name: input.name,
    email: input.email,
    mobile: input.mobile,
    country: input.country,
    timezone: input.timezone,
    role: ROLES.CUSTOMER,
    passwordHash: await hashPassword(input.password),
  });

  // Attach any pending family invitations sent to this email
  await FamilyMember.updateMany({ invitedEmail: user.email, status: 'INVITED' }, { userId: user._id, status: 'ACTIVE' });

  await audit({ actor: { id: user._id, role: user.role }, action: 'USER_REGISTERED', entityType: 'User', entityId: user._id, req: ctx.req });
  const tokens = await tokenService.issueTokenPair(user, ctx);
  return { user, ...tokens };
}

async function registerAssistant(input, ctx) {
  await assertUnique(input.email, input.mobile);
  const session = await mongoose.startSession();
  let user;
  try {
    await session.withTransaction(async () => {
      [user] = await User.create(
        [{ name: input.name, email: input.email, mobile: input.mobile, country: 'IN', timezone: 'Asia/Kolkata', role: ROLES.ASSISTANT, passwordHash: await hashPassword(input.password) }],
        { session }
      );
      await Assistant.create(
        [
          {
            userId: user._id,
            gender: input.gender,
            dateOfBirth: input.dateOfBirth,
            address: input.address,
            qualification: input.qualification,
            experienceYears: input.experienceYears,
            languages: input.languages,
            serviceAreas: input.serviceAreas,
          },
        ],
        { session }
      );
    });
  } catch (err) {
    // Standalone Mongo (no replica set) cannot run transactions — fall back safely in dev
    if (!/Transaction numbers|replica set/i.test(err.message)) throw err;
    user = await User.create({ name: input.name, email: input.email, mobile: input.mobile, country: 'IN', timezone: 'Asia/Kolkata', role: ROLES.ASSISTANT, passwordHash: await hashPassword(input.password) });
    await Assistant.create({ userId: user._id, gender: input.gender, dateOfBirth: input.dateOfBirth, address: input.address, qualification: input.qualification, experienceYears: input.experienceYears, languages: input.languages, serviceAreas: input.serviceAreas });
  } finally {
    await session.endSession();
  }

  await audit({ actor: { id: user._id, role: user.role }, action: 'ASSISTANT_REGISTERED', entityType: 'User', entityId: user._id, req: ctx.req });
  await notifications.notifyAdmins({ type: 'ASSISTANT_SIGNUP', title: 'New assistant signup', body: `${user.name} is waiting for verification`, data: { assistantId: String(user._id) }, push: false });
  const tokens = await tokenService.issueTokenPair(user, ctx);
  return { user, ...tokens };
}

async function login({ identifier, password, portal }, ctx) {
  const user = await findByIdentifier(identifier);
  // Same error for unknown user and bad password (no account enumeration)
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : await bcrypt.compare(password, DUMMY_HASH);
  if (!user || !valid) throw ApiError.unauthorized('Incorrect email/mobile or password', 'INVALID_CREDENTIALS');
  if (user.status !== 'ACTIVE') throw ApiError.forbidden('This account is suspended. Contact support.', 'ACCOUNT_SUSPENDED');
  if (portal === 'ADMIN' && user.role !== ROLES.ADMIN) throw ApiError.forbidden('Admin access only', 'NOT_ADMIN');
  if (portal === 'MOBILE' && user.role === ROLES.ADMIN) throw ApiError.forbidden('Use the admin dashboard to sign in', 'USE_ADMIN_PORTAL');

  user.lastLoginAt = new Date();
  await user.save();
  const tokens = await tokenService.issueTokenPair(user, ctx);
  if (user.role === ROLES.ADMIN) await audit({ actor: { id: user._id, role: user.role }, action: 'ADMIN_LOGIN', entityType: 'User', entityId: user._id, req: ctx.req });
  return { user, ...tokens };
}

/** Always responds generically — never reveals whether the account exists. */
async function requestPasswordReset(identifier) {
  const user = await findByIdentifier(identifier);
  if (!user || user.status !== 'ACTIVE') return;
  const otp = randomOtp();
  await redis.set(`otp:reset:${user._id}`, JSON.stringify({ hash: sha256(otp), attempts: 0 }), 'EX', OTP_TTL_SECONDS);
  await deliverOtp(user, otp);
}

// TODO(prod): plug in SMS (MSG91/Twilio) or email (SES/Resend) provider here.
async function deliverOtp(user, otp) {
  if (!env.isProd) logger.warn({ userId: String(user._id) }, `[DEV ONLY] Password reset OTP: ${otp}`);
}

async function resetPassword({ identifier, otp, newPassword }) {
  const user = await findByIdentifier(identifier);
  const invalid = ApiError.badRequest('Invalid or expired code', 'OTP_INVALID');
  if (!user) throw invalid;
  const key = `otp:reset:${user._id}`;
  const stored = await redis.get(key);
  if (!stored) throw invalid;
  const record = JSON.parse(stored);
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    await redis.del(key);
    throw ApiError.badRequest('Too many attempts. Request a new code.', 'OTP_LOCKED');
  }
  if (!safeEqual(record.hash, sha256(otp))) {
    record.attempts += 1;
    await redis.set(key, JSON.stringify(record), 'KEEPTTL');
    throw invalid;
  }
  await redis.del(key);
  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  await user.save();
  await tokenService.revokeAllForUser(user._id);
  await audit({ actor: { id: user._id, role: user.role }, action: 'PASSWORD_RESET', entityType: 'User', entityId: user._id });
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) throw ApiError.badRequest('Current password is incorrect', 'INVALID_PASSWORD');
  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  await user.save();
  await tokenService.revokeAllForUser(user._id);
  return tokenService.issueTokenPair(user, {});
}

module.exports = { registerCustomer, registerAssistant, login, requestPasswordReset, resetPassword, changePassword, hashPassword };
