const { applySearchAndDates } = require('../utils/listFilters');
const { Assistant, AssistantDocument, User, Booking } = require('../models');
const { ApiError } = require('../utils/ApiError');
const { encrypt, last4 } = require('../utils/crypto');
const { parsePagination, pageMeta } = require('../utils/pagination');
const { DateTime } = require('../utils/time');
const { ASSISTANT_VERIFICATION: V, BOOKING_STATUS: S, OPERATIONAL_TIMEZONE, TERMINAL_STATUSES } = require('../config/constants');
const mediaService = require('./media.service');
const serializers = require('./serializers');
const notifications = require('./notification.service');
const { audit } = require('./audit.service');

async function getProfileDoc(userId) {
  const profile = await Assistant.findOne({ userId });
  if (!profile) throw ApiError.notFound('Assistant profile not found', 'ASSISTANT_NOT_FOUND');
  return profile;
}

async function getProfile(userId) {
  const [user, profile, documents] = await Promise.all([
    User.findById(userId).lean(),
    getProfileDoc(userId),
    AssistantDocument.find({ assistantUserId: userId }).select('type status numberLast4 reviewNotes createdAt').lean(),
  ]);
  return { user: { _id: user._id, name: user.name, email: user.email, mobile: user.mobile }, profile, documents };
}

async function updateProfile(userId, input) {
  const profile = await getProfileDoc(userId);
  const { bank, panNumber, name, ...rest } = input;
  profile.set(rest);
  if (bank) {
    profile.bank = {
      accountHolder: bank.accountHolder ?? profile.bank?.accountHolder,
      ifsc: bank.ifsc ?? profile.bank?.ifsc,
      upiId: bank.upiId ?? profile.bank?.upiId,
      accountNumberEnc: bank.accountNumber ? encrypt(bank.accountNumber) : profile.bank?.accountNumberEnc,
      accountLast4: bank.accountNumber ? last4(bank.accountNumber) : profile.bank?.accountLast4,
    };
  }
  if (panNumber) profile.pan = { numberEnc: encrypt(panNumber), last4: last4(panNumber) };
  // Editing KYC-relevant data after rejection puts profile back in the review queue
  if (profile.verificationStatus === V.REJECTED) {
    profile.verificationHistory.push({ from: V.REJECTED, to: V.PENDING, by: userId, notes: 'Profile updated after rejection' });
    profile.verificationStatus = V.PENDING;
  }
  await profile.save();
  if (name) await User.updateOne({ _id: userId }, { name });
  return getProfile(userId);
}

async function setAvailability(userId, { isAvailable, workingHours }) {
  const profile = await getProfileDoc(userId);
  if (isAvailable !== undefined) profile.isAvailable = isAvailable;
  if (workingHours) profile.workingHours = workingHours;
  await profile.save();
  return { isAvailable: profile.isAvailable, workingHours: profile.workingHours, isOnline: profile.isOnline };
}

async function uploadDocument(user, file, { type, documentNumber }) {
  const media = await mediaService.store({ buffer: file.buffer, mime: file.mimetype, size: file.size, originalName: file.originalname, type, uploadedBy: user.id, folder: `kyc/${user.id}` });
  const doc = await AssistantDocument.create({ assistantUserId: user.id, type, mediaId: media._id, numberEnc: encrypt(documentNumber), numberLast4: last4(documentNumber) });
  const profile = await getProfileDoc(user.id);
  if (profile.verificationStatus === V.REJECTED) {
    profile.verificationHistory.push({ from: V.REJECTED, to: V.PENDING, by: user.id, notes: 'New document uploaded' });
    profile.verificationStatus = V.PENDING;
    await profile.save();
  }
  await audit({ actor: user, action: 'ASSISTANT_DOCUMENT_UPLOADED', entityType: 'AssistantDocument', entityId: doc._id, metadata: { type } });
  return { _id: doc._id, type: doc.type, status: doc.status, numberLast4: doc.numberLast4 };
}

// ---- jobs ------------------------------------------------------------------

async function listJobs(userId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { assistantId: userId };
  const now = new Date();
  if (query.scope === 'today') {
    const start = DateTime.now().setZone(OPERATIONAL_TIMEZONE).startOf('day');
    filter.scheduledAt = { $gte: start.toJSDate(), $lt: start.plus({ days: 1 }).toJSDate() };
    filter.status = { $nin: [S.CANCELLED_BY_ADMIN, S.CANCELLED_BY_CUSTOMER] };
  } else if (query.scope === 'upcoming') {
    filter.status = { $in: [S.ASSISTANT_ASSIGNED, S.ASSISTANT_ACCEPTED, S.ON_THE_WAY, S.REACHED, S.VISIT_STARTED] };
  } else if (query.scope === 'history') {
    filter.status = { $in: TERMINAL_STATUSES.concat([S.VISIT_COMPLETED, S.REPORT_GENERATED]) };
  } else if (query.scope === 'new') {
    filter.status = S.ASSISTANT_ASSIGNED;
  }
  if (query.status) filter.status = query.status;
  applySearchAndDates(filter, query);
  const sort = query.scope === 'history' ? { scheduledAt: -1 } : { scheduledAt: 1 };
  const [items, total] = await Promise.all([Booking.find(filter).sort(sort).skip(skip).limit(limit), Booking.countDocuments(filter)]);
  return { items: items.map(serializers.forAssistant), meta: pageMeta({ page, limit }, total), now };
}

async function home(userId) {
  const start = DateTime.now().setZone(OPERATIONAL_TIMEZONE).startOf('day');
  const today = await Booking.find({
    assistantId: userId,
    scheduledAt: { $gte: start.toJSDate(), $lt: start.plus({ days: 1 }).toJSDate() },
    status: { $nin: [S.CANCELLED_BY_ADMIN, S.CANCELLED_BY_CUSTOMER] },
  }).sort({ scheduledAt: 1 });
  const done = [S.VISIT_COMPLETED, S.REPORT_GENERATED, S.COMPLETED];
  const [profile, pendingAcceptance] = await Promise.all([Assistant.findOne({ userId }).select('verificationStatus isOnline isAvailable stats rating').lean(), Booking.countDocuments({ assistantId: userId, status: S.ASSISTANT_ASSIGNED })]);
  return {
    profile,
    todays: today.map(serializers.forAssistant),
    counts: { today: today.length, completed: today.filter((b) => done.includes(b.status)).length, pending: today.filter((b) => !done.includes(b.status) && b.status !== S.NO_SHOW).length, awaitingAcceptance: pendingAcceptance },
  };
}

async function earnings(userId, query) {
  // Payout model is business-specific; this returns completed-visit counts per month for now.
  const months = Math.min(12, Number(query.months) || 6);
  const since = DateTime.now().setZone(OPERATIONAL_TIMEZONE).minus({ months: months - 1 }).startOf('month').toJSDate();
  const rows = await Booking.aggregate([
    { $match: { assistantId: new (require('mongoose').Types.ObjectId)(userId), status: S.COMPLETED, completedAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$completedAt', timezone: OPERATIONAL_TIMEZONE } }, visits: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return { months: rows.map((r) => ({ month: r._id, completedVisits: r.visits })) };
}

// ---- admin ----------------------------------------------------------------

const VERIFY_TRANSITIONS = {
  [V.PENDING]: [V.DOCUMENT_REVIEW, V.REJECTED],
  [V.DOCUMENT_REVIEW]: [V.APPROVED, V.REJECTED],
  [V.APPROVED]: [V.REJECTED], // suspend
  [V.REJECTED]: [V.DOCUMENT_REVIEW],
};

async function setVerification(admin, assistantUserId, to, notes, req) {
  const profile = await getProfileDoc(assistantUserId);
  const from = profile.verificationStatus;
  // Admin can approve straight from PENDING by passing through DOCUMENT_REVIEW
  const path = from === V.PENDING && to === V.APPROVED ? [V.DOCUMENT_REVIEW, V.APPROVED] : [to];
  let cursor = from;
  for (const step of path) {
    if (!(VERIFY_TRANSITIONS[cursor] || []).includes(step)) throw ApiError.conflict(`Cannot move assistant from ${cursor} to ${step}`, 'INVALID_VERIFICATION_TRANSITION');
    profile.verificationHistory.push({ from: cursor, to: step, by: admin.id, notes });
    cursor = step;
  }
  if (to === V.APPROVED) {
    const docs = await AssistantDocument.countDocuments({ assistantUserId, type: 'GOV_ID' });
    if (!docs) throw ApiError.conflict('Government ID document is required before approval', 'GOV_ID_REQUIRED');
    await AssistantDocument.updateMany({ assistantUserId, status: 'PENDING' }, { status: 'ACCEPTED', reviewedBy: admin.id, reviewedAt: new Date() });
  }
  profile.verificationStatus = cursor;
  await profile.save();
  await audit({ actor: admin, action: `ASSISTANT_${to}`, entityType: 'Assistant', entityId: profile._id, metadata: { assistantUserId, from, to, notes }, req });
  if (to === V.APPROVED || to === V.REJECTED) {
    await notifications.notify({
      userIds: assistantUserId,
      type: to === V.APPROVED ? notifications.TYPES.ACCOUNT_APPROVED : notifications.TYPES.ACCOUNT_REJECTED,
      title: to === V.APPROVED ? 'You are verified' : 'Verification update',
      body: to === V.APPROVED ? 'Your profile is approved. You can now receive visit requests.' : `Your verification was not approved.${notes ? ` Reason: ${notes}` : ''}`,
    });
  }
  return profile;
}

module.exports = { getProfile, updateProfile, setAvailability, uploadDocument, listJobs, home, earnings, setVerification, getProfileDoc };
