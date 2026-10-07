const crypto = require('crypto');
const { User, Assistant, Parent, FamilyMember, Service, RecurringPlan } = require('../models');
const { ApiError } = require('../utils/ApiError');
const { ROLES, ASSISTANT_VERIFICATION } = require('../config/constants');
const { audit } = require('./audit.service');
const { hashPassword } = require('./auth.service');
const { revokeAllForUser } = require('./token.service');
const { nextNumber } = require('../models/Counter');
const { localToUtc } = require('../utils/time');
const catalog = require('./catalog.service');
const recurring = require('./recurring.service');
const parentService = require('./parent.service');
const notifications = require('./notification.service');

const tempPassword = () => `Pc@${crypto.randomBytes(5).toString('hex')}`;

async function assertUnique(email, mobile) {
  const or = [{ email: email.toLowerCase() }];
  if (mobile) or.push({ mobile });
  if (await User.exists({ $or: or })) throw ApiError.conflict('Email or mobile is already registered', 'ACCOUNT_EXISTS');
}

async function createUser(admin, role, input, req) {
  await assertUnique(input.email, input.mobile);
  const password = input.password || tempPassword();
  const user = await User.create({
    name: input.name, email: input.email, mobile: input.mobile, country: input.country || 'US', timezone: input.timezone || 'UTC', role,
    passwordHash: await hashPassword(password),
    status: input.loginEnabled === false ? 'SUSPENDED' : 'ACTIVE',
  });
  await audit({ actor: admin, action: `ADMIN_CREATED_${role}`, entityType: 'User', entityId: user._id, req });
  return { user, password };
}

async function createCustomer(admin, input, req) {
  const { user, password } = await createUser(admin, ROLES.CUSTOMER, input, req);
  return { user, temporaryPassword: password };
}

async function createAssistant(admin, input, req) {
  const { user, password } = await createUser(admin, ROLES.ASSISTANT, input, req);
  await Assistant.create({
    userId: user._id, serviceIds: input.serviceIds || [], serviceAreas: input.serviceAreas || [],
    verificationStatus: ASSISTANT_VERIFICATION.APPROVED, // admin-created = already vetted
  });
  return { user, temporaryPassword: password };
}

/** Admin adds a parent / patient (e.g. "Mom") under a customer's account. */
async function createParentFor(admin, customerId, input, req) {
  const customer = await User.findOne({ _id: customerId, role: ROLES.CUSTOMER });
  if (!customer) throw ApiError.notFound('Customer not found', 'CUSTOMER_NOT_FOUND');
  return parentService.create({ id: String(customer._id), role: ROLES.CUSTOMER, name: customer.name }, input, req);
}

async function setLoginAccess(admin, userId, enabled, req) {
  const user = await User.findById(userId);
  if (!user || ![ROLES.CUSTOMER, ROLES.ASSISTANT].includes(user.role)) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  user.status = enabled ? 'ACTIVE' : 'SUSPENDED';
  await user.save();
  if (!enabled) {
    await revokeAllForUser(user._id);
    if (user.role === ROLES.ASSISTANT) await Assistant.updateOne({ userId: user._id }, { isOnline: false, isAvailable: false });
  }
  await audit({ actor: admin, action: enabled ? 'LOGIN_ENABLED' : 'LOGIN_DISABLED', entityType: 'User', entityId: user._id, req });
  return user;
}

async function resetPassword(admin, userId, req) {
  const user = await User.findById(userId);
  if (!user || user.role === ROLES.ADMIN) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  const password = tempPassword();
  user.passwordHash = await hashPassword(password);
  user.passwordChangedAt = new Date();
  await user.save();
  await revokeAllForUser(user._id);
  await audit({ actor: admin, action: 'ADMIN_RESET_PASSWORD', entityType: 'User', entityId: user._id, req });
  return { temporaryPassword: password };
}

/** Admin sells/assigns a plan to a customer (payment handled offline). Optionally pins one assistant for every visit. */
async function createPlanFor(admin, input, req) {
  const customer = await User.findOne({ _id: input.customerId, role: ROLES.CUSTOMER });
  if (!customer) throw ApiError.notFound('Customer not found', 'CUSTOMER_NOT_FOUND');
  const parent = await Parent.findOne({ _id: input.parentId, ownerId: customer._id, status: 'ACTIVE' });
  if (!parent) throw ApiError.notFound('Parent not found for this customer', 'PARENT_NOT_FOUND');
  const sheets = input.sheets?.length ? input.sheets : [{ serviceId: input.serviceId }];
  if (!sheets[0].serviceId) throw ApiError.badRequest('Select at least one service', 'SERVICE_REQUIRED');
  const picked = await Promise.all(sheets.map((x) => catalog.getById(x.serviceId, { activeOnly: false })));
  const service = picked[0]; // primary service (name, duration)
  const frequency = input.frequency || 'DAILY';
  const intervalDays = frequency === 'CUSTOM' ? input.intervalDays || 1 : undefined;
  const tz = parent.timezone || 'UTC';
  const totalVisits = input.endDate
    ? recurring.countVisits({ startDate: input.startDate, endDate: input.endDate, time: input.time, timezone: tz, frequency, intervalDays })
    : input.totalVisits;
  if (!totalVisits || totalVisits < 1) throw ApiError.badRequest('End date must be on/after the start date (or give number of visits)', 'RANGE_EMPTY');
  const price = catalog.priceFor(service, { recurring: true });
  const amount = input.pricePerVisit ?? picked.reduce((sum, sv) => sum + catalog.priceFor(sv, { recurring: true }).amount, 0);
  const plan = await RecurringPlan.create({
    planNumber: await nextNumber('RP'), customerId: customer._id, parentId: parent._id, serviceId: service._id,
    frequency, intervalDays, startDate: input.startDate, timeOfDay: input.time, timezone: parent.timezone || 'UTC',
    totalVisits, pricePerVisit: amount, totalAmount: amount * totalVisits, currency: price.currency,
    sheets: sheets.map((x) => ({ serviceId: x.serviceId, itemKeys: x.itemKeys })), status: 'ACTIVE', preferredAssistantId: input.assistantId, createdByAdmin: admin.id, notes: input.notes,
    nextOccurrenceAt: localToUtc(input.startDate, input.time, parent.timezone || 'UTC'),
  });
  plan.endDate = recurring.localDate(plan, totalVisits - 1);
  await plan.save();
  await audit({ actor: admin, action: 'ADMIN_PLAN_CREATED', entityType: 'RecurringPlan', entityId: plan._id, req });
  await notifications.notify({
    userIds: customer._id, type: notifications.TYPES.BOOKING_CONFIRMED, title: 'Care plan active',
    body: `Plan ${plan.planNumber} for ${parent.fullName} is active (${plan.totalVisits} visits, ${plan.startDate} to ${plan.endDate}).`, data: { recurringPlanId: String(plan._id) },
  });
  await recurring.generateForPlan(plan);
  return RecurringPlan.findById(plan._id);
}


/** Admin edits everything about an assistant: login identity, profile, service areas, bank/PAN. */
async function updateAssistant(admin, userId, input, req) {
  const user = await User.findOne({ _id: userId, role: ROLES.ASSISTANT });
  const profile = await Assistant.findOne({ userId }).select('+bank.accountNumberEnc +pan.numberEnc');
  if (!user || !profile) throw ApiError.notFound('Assistant not found', 'ASSISTANT_NOT_FOUND');
  const { name, email, mobile, bank, panNumber, ...rest } = input;
  if ((email && email !== user.email) || (mobile && mobile !== user.mobile)) {
    const or = [];
    if (email && email !== user.email) or.push({ email });
    if (mobile && mobile !== user.mobile) or.push({ mobile });
    if (await User.exists({ _id: { $ne: user._id }, $or: or })) throw ApiError.conflict('Email or mobile is already used by another account', 'ACCOUNT_EXISTS');
  }
  if (name) user.name = name;
  if (email) user.email = email;
  if (mobile) user.mobile = mobile;
  await user.save();
  if (rest.address) rest.address = { ...(profile.address?.toObject?.() || {}), ...rest.address };
  profile.set(rest);
  if (bank) {
    const { encrypt } = require('../utils/crypto');
    const last4 = (v) => String(v).slice(-4);
    profile.bank = {
      accountHolder: bank.accountHolder ?? profile.bank?.accountHolder, ifsc: bank.ifsc ?? profile.bank?.ifsc, upiId: bank.upiId ?? profile.bank?.upiId,
      accountNumberEnc: bank.accountNumber ? encrypt(bank.accountNumber) : profile.bank?.accountNumberEnc, accountLast4: bank.accountNumber ? last4(bank.accountNumber) : profile.bank?.accountLast4,
    };
  }
  if (panNumber) {
    const { encrypt } = require('../utils/crypto');
    profile.pan = { numberEnc: encrypt(panNumber), last4: String(panNumber).slice(-4) };
  }
  await profile.save();
  await audit({ actor: admin, action: 'ADMIN_UPDATED_ASSISTANT', entityType: 'User', entityId: user._id, metadata: { fields: Object.keys(input) }, req });
  return { _id: user._id };
}

/** Admin uploads a KYC document on behalf of an assistant (auto-accepted: admin has seen the original). */
async function addAssistantDocument(admin, userId, file, { type, documentNumber }, req) {
  const user = await User.findOne({ _id: userId, role: ROLES.ASSISTANT }).select('_id');
  if (!user) throw ApiError.notFound('Assistant not found', 'ASSISTANT_NOT_FOUND');
  if (!file) throw ApiError.badRequest('Choose a file to upload', 'FILE_REQUIRED');
  const { AssistantDocument } = require('../models');
  const { encrypt } = require('../utils/crypto');
  const mediaService = require('./media.service');
  const media = await mediaService.store({ buffer: file.buffer, mime: file.mimetype, size: file.size, originalName: file.originalname, type, uploadedBy: admin.id, folder: `kyc/${userId}` });
  const doc = await AssistantDocument.create({
    assistantUserId: userId, type, mediaId: media._id, numberEnc: documentNumber ? encrypt(documentNumber) : undefined, numberLast4: documentNumber ? String(documentNumber).slice(-4) : undefined,
    status: 'ACCEPTED', reviewedBy: admin.id, reviewedAt: new Date(), reviewNotes: 'Uploaded by admin',
  });
  await audit({ actor: admin, action: 'ADMIN_UPLOADED_ASSISTANT_DOCUMENT', entityType: 'AssistantDocument', entityId: doc._id, metadata: { type }, req });
  return doc;
}

async function deleteAssistantDocument(admin, documentId, req) {
  const { AssistantDocument } = require('../models');
  const doc = await AssistantDocument.findByIdAndDelete(documentId);
  if (!doc) throw ApiError.notFound('Document not found', 'DOCUMENT_NOT_FOUND');
  await audit({ actor: admin, action: 'ADMIN_DELETED_ASSISTANT_DOCUMENT', entityType: 'AssistantDocument', entityId: doc._id, req });
  return { _id: doc._id };
}


/** Soft-delete a customer or assistant. Blocked while they still have upcoming work. History (visits, reports, payments) is kept. */
async function deleteUser(admin, userId, expectedRole, req, { force = false } = {}) {
  const user = await User.findOne({ _id: userId, role: expectedRole });
  if (!user || user.status === 'DELETED') throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  const { Booking, RecurringPlan } = require('../models');
  const { BOOKING_STATUS: S } = require('../config/constants');
  const finished = [S.DRAFT, S.PENDING_PAYMENT, S.PAYMENT_SUCCESS, S.VISIT_COMPLETED, S.REPORT_GENERATED, S.COMPLETED, S.NO_SHOW, S.CANCELLED_BY_CUSTOMER, S.CANCELLED_BY_ADMIN, S.CANCELLED_BY_ASSISTANT, S.REFUNDED].filter(Boolean);
  const who = expectedRole === ROLES.CUSTOMER ? { customerId: user._id } : { assistantId: user._id };
  if (force && expectedRole === ROLES.CUSTOMER) {
    // cancel everything in one go: plans first (cancels their future visits + refunds unused), then any remaining single visits
    const recurringSvc = require('./recurring.service');
    const bookingSvc = require('./booking.service');
    const reason = 'Account deleted by admin';
    const plans = await RecurringPlan.find({ customerId: user._id, status: { $in: ['ACTIVE', 'PAUSED', 'PENDING_PAYMENT'] } }).select('_id');
    for (const p of plans) await recurringSvc.cancelPlan(admin, p._id, { reason }, req).catch(() => null);
    const left = await Booking.find({ ...who, status: { $nin: finished }, scheduledAt: { $gte: new Date(Date.now() - 12 * 3600000) } }).select('_id');
    for (const b of left) await bookingSvc.cancel(admin, b._id, { reason }, req).catch(() => null);
  }
  const open = await Booking.countDocuments({ ...who, status: { $nin: finished }, scheduledAt: { $gte: new Date(Date.now() - 12 * 3600000) } });
  if (open) throw ApiError.conflict(`${open} upcoming visit(s) still exist. Cancel them first (for a customer you can tick "cancel everything").`, 'HAS_OPEN_BOOKINGS');
  if (expectedRole === ROLES.CUSTOMER && (await RecurringPlan.exists({ customerId: user._id, status: { $in: ['ACTIVE', 'PAUSED', 'PENDING_PAYMENT'] } }))) {
    throw ApiError.conflict('This customer still has an active plan. Cancel it first.', 'HAS_ACTIVE_PLAN');
  }
  user.status = 'DELETED';
  user.email = `deleted-${user._id}@deleted.invalid`; // frees the email / mobile for reuse
  user.mobile = undefined;
  await user.save();
  await revokeAllForUser(user._id);
  if (expectedRole === ROLES.ASSISTANT) await Assistant.updateOne({ userId: user._id }, { isOnline: false, isAvailable: false });
  await audit({ actor: admin, action: `ADMIN_DELETED_${expectedRole}`, entityType: 'User', entityId: user._id, req });
  return { _id: user._id };
}

module.exports = { deleteUser, updateAssistant, addAssistantDocument, deleteAssistantDocument, createCustomer, createAssistant, createParentFor, setLoginAccess, resetPassword, createPlanFor };
