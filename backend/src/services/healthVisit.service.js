/**
 * Visit capture: autosave draft → media → complete (idempotent) → report → COMPLETED.
 * Corrections after completion never mutate the old report: they bump visit.version and issue a new report.
 */
const { Booking, HealthVisit, HealthMeasurement, HealthReport, Parent, Assistant, FamilyMember, Media } = require('../models');
const { ApiError } = require('../utils/ApiError');
const { logger } = require('../config/logger');
const { BOOKING_STATUS: S, ROLES, OVERALL_STATUS, SYSTEM_ACTOR, FAMILY_PERMISSIONS } = require('../config/constants');
const { emitTo } = require('../sockets/emitter');
const { rooms, SOCKET_EVENTS } = require('../sockets/events');
const validators = require('../validators/healthVisit.validators');
const sm = require('./bookingStateMachine');
const access = require('./access.service');
const mediaService = require('./media.service');
const reportService = require('./report.service');
const notifications = require('./notification.service');
const emergency = require('./emergency.service');
const { broadcastBooking } = require('./bookingEvents');
const { audit } = require('./audit.service');

const VISIT_MEDIA_TYPES = ['PRESCRIPTION', 'MEDICINE', 'TEST_REPORT', 'WOUND', 'OTHER'];
const MAX_VISIT_MEDIA = 20;

const VITAL_PRESENT = {
  bp: (m) => Number.isFinite(m?.bp?.systolic) && Number.isFinite(m?.bp?.diastolic),
  pulse: (m) => Number.isFinite(m?.pulse),
  spo2: (m) => Number.isFinite(m?.spo2),
  temperature: (m) => Number.isFinite(m?.temperature?.value),
  weight: (m) => Number.isFinite(m?.weight?.value),
  bloodSugar: (m) => Number.isFinite(m?.bloodSugar?.value),
};
const VITAL_LABEL = { bp: 'Blood pressure', pulse: 'Pulse', spo2: 'SpO2', temperature: 'Temperature', weight: 'Weight', bloodSugar: 'Blood sugar' };

const plain = (doc) => (doc?.toObject ? doc.toObject() : doc);

/** Flatten a draft payload into $set paths (measurements merged key-by-key so partial autosaves don't wipe others). */
function toSet(input) {
  const set = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || k === 'confirm') continue;
    if (k === 'measurements') {
      for (const [mk, mv] of Object.entries(v)) if (mv !== undefined) set[`measurements.${mk}`] = mv;
    } else if (k === 'wellbeing') {
      for (const [wk, wv] of Object.entries(v)) if (wv !== undefined) set[`wellbeing.${wk}`] = wv;
    } else {
      set[k] = v;
    }
  }
  return set;
}

function notifyChannels(booking) {
  return [rooms.booking(String(booking._id)), rooms.admin()];
}

async function loadAssignedBooking(user, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, assistantId: user.id });
  if (!booking) throw ApiError.notFound('Job not found', 'JOB_NOT_FOUND');
  return booking;
}

async function loadVisitForBooking(bookingId) {
  const visit = await HealthVisit.findOne({ bookingId });
  if (!visit) throw ApiError.notFound('Visit has not started', 'VISIT_NOT_STARTED');
  return visit;
}

// ---------------------------------------------------------------- read

async function getVisit(user, bookingId) {
  const booking = await access.assertBookingAccess(user, bookingId);
  const visit = await loadVisitForBooking(booking._id);
  // customers/family see data only after the assistant confirms — drafts can contain half-typed values
  if (user.role === ROLES.CUSTOMER && visit.status !== 'COMPLETED') throw ApiError.notFound('Visit summary is not ready yet', 'VISIT_NOT_READY');
  const media = await Media.find({ _id: { $in: visit.mediaIds } }).lean();
  const result = { ...plain(visit), media: await mediaService.withUrls(media) };
  if (user.role === ROLES.ASSISTANT) {
    result.form = {
      fields: booking.serviceSnapshot?.fields || {},
      symptomsList: booking.serviceSnapshot?.symptomsList || [],
      medicines: booking.parentSnapshot?.medicines || [],
      parentName: booking.parentSnapshot?.fullName,
      reportTemplates: (booking.serviceSnapshot?.sheets || []).map((x) => ({ _id: String(x.serviceId), name: x.name, kind: x.kind, items: x.items })),
    };
  }
  if (user.role !== ROLES.ADMIN) delete result.completionKey;
  return result;
}

// ---------------------------------------------------------------- draft + media

async function saveDraft(user, bookingId, input) {
  const booking = await loadAssignedBooking(user, bookingId);
  if (booking.status !== S.VISIT_STARTED) throw ApiError.conflict('Visit is not in progress', 'VISIT_NOT_ACTIVE');
  const set = { ...toSet(input), draftSavedAt: new Date() };
  const visit = await HealthVisit.findOneAndUpdate({ bookingId: booking._id, assistantId: user.id, status: 'IN_PROGRESS' }, { $set: set }, { new: true, runValidators: true });
  if (!visit) throw ApiError.conflict('Visit is already completed', 'VISIT_ALREADY_COMPLETED');
  // no values over the wire — family only learns "assistant is recording"
  emitTo(notifyChannels(booking), SOCKET_EVENTS.HEALTH_DATA_UPDATED, { bookingId: String(booking._id), savedAt: visit.draftSavedAt, sections: Object.keys(input) });
  return { visitId: visit._id, draftSavedAt: visit.draftSavedAt };
}

async function addMedia(user, bookingId, file, { type = 'OTHER', caption } = {}, req) {
  if (!file) throw ApiError.badRequest('File is required', 'FILE_REQUIRED');
  if (!VISIT_MEDIA_TYPES.includes(type)) throw ApiError.badRequest(`type must be one of ${VISIT_MEDIA_TYPES.join(', ')}`, 'INVALID_MEDIA_TYPE');
  const booking = await mediaService.assertVisitUploadAllowed(user, bookingId);
  const visit = await loadVisitForBooking(booking._id);
  if (visit.status !== 'IN_PROGRESS') throw ApiError.conflict('Visit is already completed', 'VISIT_ALREADY_COMPLETED');
  if (visit.mediaIds.length >= MAX_VISIT_MEDIA) throw ApiError.conflict(`Maximum ${MAX_VISIT_MEDIA} files per visit`, 'MEDIA_LIMIT');
  const media = await mediaService.store({
    buffer: file.buffer,
    mime: file.mimetype,
    size: file.size,
    originalName: file.originalname,
    type,
    caption,
    uploadedBy: user.id,
    folder: 'visits',
    bookingId: booking._id,
    visitId: visit._id,
    parentId: booking.parentId,
  });
  await HealthVisit.updateOne({ _id: visit._id, status: 'IN_PROGRESS' }, { $addToSet: { mediaIds: media._id } });
  await audit({ actor: user, action: 'VISIT_MEDIA_ADDED', entityType: 'HealthVisit', entityId: visit._id, metadata: { mediaId: String(media._id), type }, req });
  const [withUrl] = await mediaService.withUrls([media]);
  return withUrl;
}

async function removeMedia(user, bookingId, mediaId, req) {
  const booking = await mediaService.assertVisitUploadAllowed(user, bookingId);
  const res = await HealthVisit.updateOne({ bookingId: booking._id, status: 'IN_PROGRESS' }, { $pull: { mediaIds: mediaId } });
  if (!res.modifiedCount) throw ApiError.notFound('File not found on this visit', 'MEDIA_NOT_FOUND');
  await audit({ actor: user, action: 'VISIT_MEDIA_REMOVED', entityType: 'Booking', entityId: booking._id, metadata: { mediaId }, req });
  return { removed: true };
}

// ---------------------------------------------------------------- complete

function assertCompleteable(visitData, booking) {
  if (visitData.reportMode === 'IMAGE') {
    // photo/scan of the paper report replaces typed lab values — but at least one report image is mandatory
    // (media types are resolved by the caller: see complete())
    if (!visitData.hasReportImage) throw ApiError.unprocessable('Upload at least one report image (type: Test report)', 'REPORT_IMAGE_REQUIRED');
  }
  const fields = booking.serviceSnapshot?.fields || {};
  const missing = (fields.vitals || []).filter((v) => v.required !== false && !VITAL_PRESENT[v.key]?.(visitData.measurements)).map((v) => VITAL_LABEL[v.key] || v.key);
  if (missing.length) throw ApiError.unprocessable(`Please record: ${missing.join(', ')}`, 'REQUIRED_VITALS_MISSING', { missing });
  const minPhotos = fields.minPhotos || 0;
  if ((visitData.mediaIds || []).length < minPhotos) throw ApiError.unprocessable(`At least ${minPhotos} photo(s) required for this service`, 'PHOTOS_REQUIRED');
  if (!visitData.overallStatus) throw ApiError.unprocessable('Select an overall status', 'OVERALL_STATUS_REQUIRED');
  if (visitData.overallStatus === OVERALL_STATUS.URGENT_ATTENTION && !visitData.urgent?.reason) {
    throw ApiError.unprocessable('Urgent reason, notes and escalation are required', 'URGENT_DETAILS_REQUIRED');
  }
}

function measurementDocs(visit) {
  const m = plain(visit.measurements) || {};
  const at = visit.completedAt || new Date();
  const base = { parentId: visit.parentId, visitId: visit._id, recordedAt: at };
  const rows = [];
  if (VITAL_PRESENT.bp(m)) {
    rows.push({ ...base, type: 'BP_SYSTOLIC', value: m.bp.systolic, unit: 'mmHg' });
    rows.push({ ...base, type: 'BP_DIASTOLIC', value: m.bp.diastolic, unit: 'mmHg' });
  }
  if (VITAL_PRESENT.pulse(m)) rows.push({ ...base, type: 'PULSE', value: m.pulse, unit: 'bpm' });
  if (VITAL_PRESENT.spo2(m)) rows.push({ ...base, type: 'SPO2', value: m.spo2, unit: '%' });
  if (VITAL_PRESENT.temperature(m)) {
    // store series in °F so trend charts are comparable
    const f = m.temperature.unit === 'C' ? Math.round((m.temperature.value * 9) / 5 * 10 + 320) / 10 : m.temperature.value;
    rows.push({ ...base, type: 'TEMPERATURE', value: f, unit: 'F' });
  }
  if (VITAL_PRESENT.weight(m)) rows.push({ ...base, type: 'WEIGHT', value: m.weight.value, unit: 'kg' });
  if (VITAL_PRESENT.bloodSugar(m)) rows.push({ ...base, type: 'BLOOD_SUGAR', value: m.bloodSugar.value, unit: 'mg/dL', context: m.bloodSugar.context });
  return rows;
}

async function familyViewerIds(booking) {
  const rows = await FamilyMember.find({ parentId: booking.parentId, status: 'ACTIVE', permissions: FAMILY_PERMISSIONS.VIEW }).select('userId').lean();
  return [...new Set([String(booking.customerId), ...rows.map((r) => String(r.userId))])];
}

/**
 * Post-completion pipeline. Safe to re-run: each step checks current state.
 * VISIT_COMPLETED → report → REPORT_GENERATED → COMPLETED
 */
async function finalize(visit, booking, assistantUser) {
  let current = booking;
  let report = current.reportId ? await HealthReport.findById(current.reportId) : await HealthReport.findOne({ visitId: visit._id }).sort({ version: -1 });
  if (!report) report = await reportService.createFromVisit(visit, current, { version: visit.version });

  if (current.status === S.VISIT_COMPLETED) {
    current = await sm.transition(current._id, [S.REPORT_GENERATED, S.COMPLETED], {
      actor: SYSTEM_ACTOR,
      expectedFrom: S.VISIT_COMPLETED,
      set: { reportId: report._id, completedAt: visit.completedAt || new Date() },
    });

    await HealthMeasurement.deleteMany({ visitId: visit._id });
    const rows = measurementDocs(visit);
    if (rows.length) await HealthMeasurement.insertMany(rows);
    await Parent.updateOne({ _id: visit.parentId }, { $set: { lastVisitAt: visit.completedAt, lastOverallStatus: visit.overallStatus } });
    await Assistant.updateOne({ userId: visit.assistantId }, { $inc: { 'stats.completedVisits': 1 } });

    if (visit.overallStatus === OVERALL_STATUS.URGENT_ATTENTION) {
      await emergency.raiseHealthUrgent({ visit, booking: current, assistant: assistantUser || { id: String(visit.assistantId) } });
    }

    const family = await familyViewerIds(current);
    const name = current.parentSnapshot.fullName;
    await notifications.notify({
      userIds: family,
      type: notifications.TYPES.REPORT_READY,
      title: `${name}'s visit report is ready`,
      body: `Visit completed. Recorded status: ${String(visit.overallStatus).replace(/_/g, ' ').toLowerCase()}. Tap to view the report.`,
      data: { bookingId: String(current._id), reportId: String(report._id) },
    });
    await notifications.notifyAdmins({
      type: notifications.TYPES.ASSISTANT_COMPLETED_VISIT,
      title: 'Visit completed',
      body: `${current.bookingNumber} · ${name} · ${visit.overallStatus}`,
      data: { bookingId: String(current._id), reportId: String(report._id) },
      push: false,
    });
    broadcastBooking(current, SOCKET_EVENTS.VISIT_COMPLETED, { reportId: String(report._id), overallStatus: visit.overallStatus });
    broadcastBooking(current, SOCKET_EVENTS.REPORT_GENERATED, { reportId: String(report._id) });
  }
  return { booking: current, report };
}

async function complete(user, bookingId, input, idempotencyKey, req) {
  const booking = await loadAssignedBooking(user, bookingId);
  const visit = await loadVisitForBooking(booking._id);

  // idempotent replay (double tap / retry after network drop)
  if (visit.status === 'COMPLETED') {
    const done = await finalize(visit, booking, user);
    return { visitId: visit._id, reportId: done.report._id, bookingStatus: done.booking.status, replayed: true };
  }
  if (booking.status !== S.VISIT_STARTED) throw ApiError.conflict('Visit is not in progress', 'VISIT_NOT_ACTIVE');

  const set = toSet(input);
  const merged = { ...plain(visit), ...input, measurements: { ...(plain(visit.measurements) || {}), ...(input.measurements || {}) } };
  merged.hasReportImage = merged.reportMode === 'IMAGE' && (await Media.exists({ _id: { $in: visit.mediaIds || [] }, type: 'TEST_REPORT' }));
  assertCompleteable(merged, booking);

  const completedAt = new Date();
  const updatedVisit = await HealthVisit.findOneAndUpdate(
    { _id: visit._id, status: 'IN_PROGRESS' },
    { $set: { ...set, status: 'COMPLETED', completedAt, completionKey: idempotencyKey || undefined } },
    { new: true, runValidators: true }
  );
  if (!updatedVisit) {
    const again = await HealthVisit.findById(visit._id);
    const done = await finalize(again, await Booking.findById(booking._id), user);
    return { visitId: again._id, reportId: done.report._id, bookingStatus: done.booking.status, replayed: true };
  }

  const afterVisit = await sm.transition(booking._id, S.VISIT_COMPLETED, { actor: user, expectedFrom: S.VISIT_STARTED, extraFilter: { assistantId: user.id } });
  await audit({ actor: user, action: 'VISIT_COMPLETED', entityType: 'HealthVisit', entityId: updatedVisit._id, metadata: { bookingId: String(booking._id), overallStatus: updatedVisit.overallStatus }, req });

  const done = await finalize(updatedVisit, afterVisit, user);
  return { visitId: updatedVisit._id, reportId: done.report._id, bookingStatus: done.booking.status, replayed: false };
}

/** Scheduler safety net: bookings stuck in VISIT_COMPLETED (e.g. crash mid-pipeline). */
async function recoverStuck() {
  const stuck = await Booking.find({ status: S.VISIT_COMPLETED, updatedAt: { $lt: new Date(Date.now() - 2 * 60 * 1000) } }).limit(20);
  for (const b of stuck) {
    try {
      const visit = await HealthVisit.findOne({ bookingId: b._id, status: 'COMPLETED' });
      if (visit) await finalize(visit, b);
    } catch (err) {
      logger.error({ err: err.message, bookingId: String(b._id) }, 'Visit finalize recovery failed');
    }
  }
  return stuck.length;
}

// ---------------------------------------------------------------- corrections

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function validateCorrectionValue(field, newValue) {
  if (field.startsWith('measurements.')) {
    const key = field.split('.')[1];
    const r = validators.measurements.safeParse({ [key]: newValue });
    if (!r.success) throw ApiError.badRequest(r.error.issues[0].message, 'VALIDATION_ERROR');
    return r.data[key];
  }
  const r = validators.visitDraft.safeParse({ [field]: newValue });
  if (!r.success) throw ApiError.badRequest(r.error.issues[0].message, 'VALIDATION_ERROR');
  return r.data[field];
}

async function loadCompletedVisit(visitId) {
  const visit = await HealthVisit.findById(visitId);
  if (!visit) throw ApiError.notFound('Visit not found', 'VISIT_NOT_FOUND');
  if (visit.status !== 'COMPLETED') throw ApiError.conflict('Only completed visits can be corrected — edit the draft instead', 'VISIT_NOT_COMPLETED');
  return visit;
}

/** Assistant (own visit) or customer/family (VIEW) can request; admin reviews. */
async function requestCorrection(user, visitId, { field, newValue, reason }, req) {
  const visit = await loadCompletedVisit(visitId);
  if (user.role === ROLES.ASSISTANT && String(visit.assistantId) !== user.id) throw ApiError.notFound('Visit not found', 'VISIT_NOT_FOUND');
  if (user.role === ROLES.CUSTOMER) await access.assertParentAccess(user, visit.parentId, FAMILY_PERMISSIONS.VIEW);
  const value = validateCorrectionValue(field, newValue);
  if (visit.corrections.some((c) => c.field === field && c.status === 'REQUESTED')) throw ApiError.conflict('A correction for this field is already pending', 'CORRECTION_PENDING');
  visit.corrections.push({ field, oldValue: getPath(plain(visit), field), newValue: value, reason, requestedBy: user.id, requestedAt: new Date(), status: 'REQUESTED' });
  await visit.save();
  const correction = visit.corrections[visit.corrections.length - 1];
  await audit({ actor: user, action: 'VISIT_CORRECTION_REQUESTED', entityType: 'HealthVisit', entityId: visit._id, metadata: { field, reason }, req });
  if (user.role !== ROLES.ADMIN) {
    await notifications.notifyAdmins({ type: 'CORRECTION_REQUESTED', title: 'Report correction requested', body: `${user.name}: ${field} — ${reason}`, data: { visitId: String(visit._id), correctionId: String(correction._id) }, push: false });
  }
  return correction;
}

async function reviewCorrection(admin, visitId, correctionId, { approve, note }, req) {
  const visit = await loadCompletedVisit(visitId);
  const correction = visit.corrections.id(correctionId);
  if (!correction) throw ApiError.notFound('Correction not found', 'CORRECTION_NOT_FOUND');
  if (correction.status !== 'REQUESTED') throw ApiError.conflict('Correction already reviewed', 'CORRECTION_REVIEWED');

  correction.reviewedBy = admin.id;
  correction.reviewedAt = new Date();
  if (!approve) {
    correction.status = 'REJECTED';
    await visit.save();
    await audit({ actor: admin, action: 'VISIT_CORRECTION_REJECTED', entityType: 'HealthVisit', entityId: visit._id, metadata: { correctionId, note }, req });
    await notifications.notify({ userIds: correction.requestedBy, type: 'CORRECTION_REVIEWED', title: 'Correction not applied', body: note || `Your correction to ${correction.field} was not applied.`, data: { visitId: String(visit._id) } });
    return { status: 'REJECTED' };
  }

  if (correction.field === 'overallStatus' && correction.newValue === OVERALL_STATUS.URGENT_ATTENTION && !visit.urgent?.reason) {
    throw ApiError.unprocessable('Add urgent details before marking urgent', 'URGENT_DETAILS_REQUIRED');
  }
  correction.oldValue = getPath(plain(visit), correction.field); // value at time of apply
  visit.set(correction.field, correction.newValue);
  correction.status = 'APPLIED';
  visit.version += 1;
  await visit.save();

  const booking = await Booking.findById(visit.bookingId);
  const report = await reportService.createFromVisit(visit, booking, { version: visit.version });
  await Booking.updateOne({ _id: booking._id }, { $set: { reportId: report._id } });
  await HealthMeasurement.deleteMany({ visitId: visit._id });
  const rows = measurementDocs(visit);
  if (rows.length) await HealthMeasurement.insertMany(rows);
  const latest = await HealthVisit.findOne({ parentId: visit.parentId, status: 'COMPLETED' }).sort({ completedAt: -1 }).select('_id overallStatus').lean();
  if (latest && String(latest._id) === String(visit._id)) await Parent.updateOne({ _id: visit.parentId }, { $set: { lastOverallStatus: visit.overallStatus } });

  await audit({ actor: admin, action: 'VISIT_CORRECTION_APPLIED', entityType: 'HealthVisit', entityId: visit._id, metadata: { correctionId, field: correction.field, version: visit.version, reportId: String(report._id), note }, req });
  await notifications.notify({
    userIds: await familyViewerIds(booking),
    type: 'REPORT_UPDATED',
    title: 'Visit report updated',
    body: `${booking.parentSnapshot.fullName}'s report was corrected (version ${visit.version}).`,
    data: { bookingId: String(booking._id), reportId: String(report._id) },
  });
  broadcastBooking(booking, SOCKET_EVENTS.REPORT_GENERATED, { reportId: String(report._id), version: visit.version });
  return { status: 'APPLIED', version: visit.version, reportId: report._id };
}

/** Admin direct edit = request + approve, both audited. */
async function adminCorrect(admin, visitId, input, req) {
  const correction = await requestCorrection(admin, visitId, input, req);
  return reviewCorrection(admin, visitId, correction._id, { approve: true, note: input.reason }, req);
}

async function pendingCorrections() {
  return HealthVisit.aggregate([
    { $match: { 'corrections.status': 'REQUESTED' } },
    { $unwind: '$corrections' },
    { $match: { 'corrections.status': 'REQUESTED' } },
    { $lookup: { from: 'bookings', localField: 'bookingId', foreignField: '_id', as: 'booking' } },
    { $lookup: { from: 'users', localField: 'corrections.requestedBy', foreignField: '_id', as: 'requester' } },
    {
      $project: {
        visitId: '$_id',
        bookingId: 1,
        bookingNumber: { $first: '$booking.bookingNumber' },
        parentName: { $first: '$booking.parentSnapshot.fullName' },
        correction: '$corrections',
        requestedByName: { $first: '$requester.name' },
      },
    },
    { $sort: { 'correction.requestedAt': -1 } },
    { $limit: 100 },
  ]);
}

module.exports = { getVisit, saveDraft, addMedia, removeMedia, complete, finalize, recoverStuck, requestCorrection, reviewCorrection, adminCorrect, pendingCorrections, measurementDocs, VISIT_MEDIA_TYPES };
