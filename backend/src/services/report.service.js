const PDFDocument = require('pdfkit');
const { HealthReport, HealthVisit, Booking, User, Media } = require('../models');
const { nextNumber } = require('../models/Counter');
const { storage } = require('../config/storage');
const { logger } = require('../config/logger');
const { ApiError } = require('../utils/ApiError');
const { ageFromDob, formatLocal } = require('../utils/time');
const { parsePagination, pageMeta } = require('../utils/pagination');
const { ROLES, FAMILY_PERMISSIONS } = require('../config/constants');
const { enqueue, QUEUE_NAMES } = require('../jobs/queues');
const access = require('./access.service');
const mediaService = require('./media.service');

const DISCLAIMER =
  'This report records measurements and observations made by a care assistant during a home visit. It is not a medical diagnosis or medical advice. Please consult a qualified doctor for any medical decisions.';

function buildReportData(visit, booking, assistant, media) {
  const p = booking.parentSnapshot;
  return {
    patient: { name: p.fullName, age: ageFromDob(p.dateOfBirth), gender: p.gender, bloodGroup: p.bloodGroup, city: booking.addressSnapshot.city },
    visit: {
      bookingNumber: booking.bookingNumber,
      scheduledAt: booking.scheduledAt,
      scheduledLocal: booking.scheduledLocal,
      timezone: booking.timezone,
      startedAt: visit.startedAt,
      completedAt: visit.completedAt,
    },
    service: { name: booking.serviceSnapshot.name },
    assistant: { name: assistant?.name },
    measurements: visit.measurements?.toObject ? visit.measurements.toObject() : visit.measurements,
    symptoms: visit.symptoms,
    symptomNotes: visit.symptomNotes,
    reportMode: visit.reportMode,
    servicesPerformed: visit.servicesPerformed,
    labReport: visit.labReport,
    reports: visit.reports,
    medicationStatus: visit.medicationStatus,
    mobility: visit.mobility,
    wellbeing: visit.wellbeing,
    notes: visit.notes,
    overallStatus: visit.overallStatus,
    urgent: visit.overallStatus === 'URGENT_ATTENTION' ? visit.urgent : undefined,
    followUp: { required: visit.followUpRequired, notes: visit.followUpNotes },
    media: media.map((m) => ({ _id: m._id, type: m.type, caption: m.caption, mime: m.mime })),
    disclaimer: DISCLAIMER,
  };
}

async function createFromVisit(visit, booking, { version = 1 } = {}) {
  const [assistant, media] = await Promise.all([User.findById(visit.assistantId).select('name').lean(), Media.find({ _id: { $in: visit.mediaIds } }).lean()]);
  const report = await HealthReport.create({
    reportNumber: await nextNumber('HR'),
    bookingId: booking._id,
    visitId: visit._id,
    parentId: booking.parentId,
    customerId: booking.customerId,
    assistantId: visit.assistantId,
    serviceName: booking.serviceSnapshot.name,
    visitDate: visit.completedAt || new Date(),
    overallStatus: visit.overallStatus,
    followUpRequired: visit.followUpRequired,
    data: buildReportData(visit, booking, assistant, media),
    version,
  });
  const queued = await enqueue(QUEUE_NAMES.REPORTS, 'pdf', { reportId: String(report._id) }).catch(() => null);
  if (!queued) generatePdf(report._id).catch((err) => logger.error({ err }, 'Inline PDF generation failed'));
  return report;
}

// ---- PDF -----------------------------------------------------------------------

const C = { brand: '#C8352E', ink: '#1F2328', muted: '#5B6470', line: '#E3E6EA', stable: '#1E7A4F', attention: '#B45309', urgent: '#B42318', tint: '#F7F8FA' };
const STATUS_LABEL = { STABLE: 'Stable', NEEDS_ATTENTION: 'Needs attention', URGENT_ATTENTION: 'Urgent attention' };
const STATUS_COLOR = { STABLE: C.stable, NEEDS_ATTENTION: C.attention, URGENT_ATTENTION: C.urgent };
const humanise = (s) => (s ? String(s).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '—');

function measurementRows(m = {}) {
  const rows = [];
  if (m.bp?.systolic) rows.push(['Blood pressure', `${m.bp.systolic}/${m.bp.diastolic} mmHg`]);
  if (m.pulse) rows.push(['Pulse', `${m.pulse} bpm`]);
  if (m.spo2) rows.push(['SpO2', `${m.spo2} %`]);
  if (m.temperature?.value) rows.push(['Temperature', `${m.temperature.value} °${m.temperature.unit || 'F'}`]);
  if (m.weight?.value) rows.push(['Weight', `${m.weight.value} kg`]);
  if (m.bloodSugar?.value) rows.push(['Blood sugar', `${m.bloodSugar.value} mg/dL (${humanise(m.bloodSugar.context)})`]);
  return rows;
}

async function renderPdf(report, images) {
  const d = report.data;
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: `Test report ${report.reportNumber}`, Author: 'ParentCare' } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const PW = doc.page.width;
  const W = PW - 96;
  const bottom = () => doc.page.height - 70;
  const tests = (d.reports || []).filter((r) => r.kind === 'TABLE' && (r.values || []).some((x) => x.value));
  const checks = (d.reports || []).filter((r) => r.kind === 'CHECKLIST' && (r.checked || []).length);
  const legacy = (d.labReport?.values || []).filter((x) => x.value);

  // Header band
  doc.rect(0, 0, PW, 64).fill(C.brand);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(20).text('ParentCare', 48, 20);
  doc.font('Helvetica').fontSize(9).text('Home health care', 48, 44);
  doc.font('Helvetica-Bold').fontSize(11).text(tests.length || legacy.length ? 'TEST REPORT' : 'VISIT REPORT', 48, 22, { width: W, align: 'right' });
  doc.font('Helvetica').fontSize(9).text(`${report.reportNumber}${report.version > 1 ? ` · version ${report.version}` : ''}`, 48, 40, { width: W, align: 'right' });

  // Patient / visit box
  const boxY = 80;
  doc.roundedRect(48, boxY, W, 92, 6).lineWidth(0.8).strokeColor(C.line).fillAndStroke(C.tint, C.line);
  const info = (label, value, x, y) => {
    doc.fillColor(C.muted).font('Helvetica').fontSize(8).text(label.toUpperCase(), x, y, { width: W / 2 - 20 });
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(10.5).text(String(value ?? '—'), x, y + 10, { width: W / 2 - 20 });
  };
  const L = 62, R = 48 + W / 2 + 6;
  info('Patient', d.patient.name, L, boxY + 12);
  info('Age / gender', `${d.patient.age ?? '—'} yrs · ${humanise(d.patient.gender)}`, L, boxY + 52);
  info('Booking', d.visit.bookingNumber, R, boxY + 12);
  info('Sample / visit date', `${d.visit.scheduledLocal?.date || ''} ${d.visit.scheduledLocal?.time || ''}`.trim(), R, boxY + 52);
  doc.y = boxY + 108;

  const ensure = (h) => { if (doc.y + h > bottom()) { doc.addPage(); doc.y = 50; return true; } return false; };
  const heading = (title, sub) => {
    ensure(60);
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(12).text(title, 48, doc.y);
    if (sub) doc.fillColor(C.muted).font('Helvetica').fontSize(9).text(sub, 48, doc.y + 1);
    doc.moveDown(0.5);
  };
  // two-column table: header bar + zebra rows
  const table = (c1, c2, rows) => {
    const head = () => {
      const y = doc.y;
      doc.rect(48, y, W, 22).fill(C.ink);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9).text(c1.toUpperCase(), 58, y + 7, { width: W * 0.55 }).text(c2.toUpperCase(), 48 + W * 0.6, y + 7, { width: W * 0.4 - 10 });
      doc.y = y + 22;
    };
    head();
    rows.forEach(([k, v], i) => {
      if (ensure(24)) head();
      const y = doc.y;
      if (i % 2 === 0) doc.rect(48, y, W, 22).fill(C.tint);
      doc.fillColor(C.ink).font('Helvetica').fontSize(10).text(k, 58, y + 6, { width: W * 0.55 });
      doc.font('Helvetica-Bold').text(String(v ?? '—'), 48 + W * 0.6, y + 6, { width: W * 0.4 - 10 });
      doc.moveTo(48, y + 22).lineTo(48 + W, y + 22).lineWidth(0.4).strokeColor(C.line).stroke();
      doc.y = y + 22;
    });
    doc.moveDown(1);
  };
  const para = (text, color = C.ink) => { doc.fillColor(color).font('Helvetica').fontSize(10).text(text, 48, doc.y, { width: W }); doc.moveDown(0.8); };

  // Test results (main part of a lab-style report)
  for (const r of tests) {
    heading(r.name, r.reportDate ? `Report date: ${r.reportDate}` : undefined);
    table('Test', 'Result', r.values.filter((x) => x.value).map((x) => [x.label, x.value]));
  }
  if (!tests.length && legacy.length) {
    heading('Blood haematology', d.labReport.reportDate ? `Report date: ${d.labReport.reportDate}` : undefined);
    table('Test', 'Result', legacy.map((x) => [x.label, x.value]));
  }
  if (d.reportMode === 'IMAGE') para('The test report was uploaded as an image. See the attached pages below.', C.muted);
  for (const r of checks) {
    heading(r.name, r.reportDate ? `Date: ${r.reportDate}` : undefined);
    table('Service', 'Status', r.checked.map((x) => [x, 'Done']));
  }

  const m = measurementRows(d.measurements);
  if (m.length) { heading('Vital signs'); table('Measurement', 'Value', m); }

  const statusColor = STATUS_COLOR[d.overallStatus] || C.muted;
  heading('Assistant observation');
  const sy = doc.y;
  doc.roundedRect(48, sy, W, 34, 5).fill(C.tint);
  doc.rect(48, sy, 4, 34).fill(statusColor);
  doc.fillColor(statusColor).font('Helvetica-Bold').fontSize(12).text(STATUS_LABEL[d.overallStatus] || '—', 62, sy + 11);
  if (d.followUp?.required) doc.fillColor(C.attention).font('Helvetica').fontSize(10).text('Follow-up recommended', 48, sy + 12, { width: W - 14, align: 'right' });
  doc.y = sy + 46;
  if (d.notes) para(d.notes);
  if (d.symptoms?.length) para(`Symptoms reported: ${d.symptoms.join(', ')}${d.symptomNotes ? `. ${d.symptomNotes}` : ''}`, C.muted);
  if (d.servicesPerformed?.length) para(`Services performed: ${d.servicesPerformed.join(', ')}`, C.muted);

  if (d.medicationStatus?.length) {
    heading('Medication record (as reported)');
    table('Medicine', 'Status', d.medicationStatus.map((x) => [`${x.medicineName} (${humanise(x.slot)})`, humanise(x.status)]));
  }
  if (d.urgent) { heading('Escalation'); para([d.urgent.reason, d.urgent.notes, d.urgent.recommendedEscalation && `Recommended: ${humanise(d.urgent.recommendedEscalation)}`].filter(Boolean).join('\n')); }
  if (d.followUp?.required && d.followUp.notes) { heading('Follow-up'); para(d.followUp.notes); }

  // Attached photos / report images, one large image per block
  if (images.length) {
    doc.addPage();
    doc.y = 50;
    heading('Attached photos and report images');
    const size = (W - 24) / 2;
    let x = 48;
    let rowY = doc.y;
    images.forEach((img, i) => {
      if (i && i % 2 === 0) { rowY += size + 24; x = 48; }
      if (rowY + size > bottom()) { doc.addPage(); rowY = 50; x = 48; }
      try {
        doc.image(img.buffer, x, rowY, { fit: [size, size], align: 'center', valign: 'center' });
        doc.rect(x, rowY, size, size).lineWidth(0.4).strokeColor(C.line).stroke();
        doc.fontSize(8).fillColor(C.muted).text(humanise(img.type), x, rowY + size + 4, { width: size });
      } catch { /* skip unreadable image */ }
      x += size + 24;
    });
  }

  // Sign-off + disclaimer
  ensure(110);
  doc.moveDown(1);
  const sg = doc.y;
  doc.moveTo(48, sg + 28).lineTo(210, sg + 28).lineWidth(0.6).strokeColor(C.muted).stroke();
  doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(10).text(d.assistant?.name || 'Care assistant', 48, sg + 33);
  doc.fillColor(C.muted).font('Helvetica').fontSize(8.5).text(`Care assistant · ${formatLocal(d.visit.completedAt || new Date(), d.visit.timezone)}`, 48, sg + 46);
  doc.fontSize(8).fillColor(C.muted).text(d.disclaimer, 48, sg + 70, { width: W });

  // Footer on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.moveTo(48, doc.page.height - 40).lineTo(48 + W, doc.page.height - 40).lineWidth(0.4).strokeColor(C.line).stroke();
    doc.fillColor(C.muted).font('Helvetica').fontSize(8).text(`ParentCare · ${report.reportNumber} · ${d.patient.name}`, 48, doc.page.height - 32, { width: W, align: 'left', lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, 48, doc.page.height - 32, { width: W, align: 'right', lineBreak: false });
  }

  doc.end();
  return done;
}

async function generatePdf(reportId) {
  const report = await HealthReport.findById(reportId);
  if (!report) return null;
  try {
    const mediaIds = (report.data.media || []).filter((m) => ['image/jpeg', 'image/png'].includes(m.mime)).slice(0, 6).map((m) => m._id);
    const media = await Media.find({ _id: { $in: mediaIds } }).lean();
    const images = [];
    for (const m of media) {
      try {
        images.push({ buffer: await storage.get(m.key), type: m.type });
      } catch (err) {
        logger.warn({ mediaId: String(m._id) }, 'Image missing for PDF');
      }
    }
    const buffer = await renderPdf(report, images);
    const pdfMedia = await mediaService.store({ buffer, mime: 'application/pdf', size: buffer.length, originalName: `${report.reportNumber}.pdf`, type: 'REPORT_PDF', uploadedBy: report.assistantId, folder: 'reports', bookingId: report.bookingId, parentId: report.parentId });
    report.pdf = { status: 'READY', mediaId: pdfMedia._id, generatedAt: new Date() };
    await report.save();
    return report;
  } catch (err) {
    report.pdf = { status: 'FAILED', error: err.message.slice(0, 300) };
    await report.save();
    throw err;
  }
}

// ---- read APIs ----------------------------------------------------------------

async function listForUser(user, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (user.role === ROLES.CUSTOMER) filter.parentId = { $in: await access.accessibleParentIds(user.id, FAMILY_PERMISSIONS.VIEW) };
  if (user.role === ROLES.ASSISTANT) filter.assistantId = user.id;
  if (query.parentId) {
    if (user.role === ROLES.CUSTOMER) await access.assertParentAccess(user, query.parentId);
    filter.parentId = query.parentId;
  }
  if (query.overallStatus) filter.overallStatus = query.overallStatus;
  if (query.followUpRequired === 'true') filter.followUpRequired = true;
  const [items, total] = await Promise.all([
    HealthReport.find(filter).sort({ visitDate: -1 }).skip(skip).limit(limit).select('reportNumber visitDate overallStatus followUpRequired serviceName parentId bookingId version pdf.status data.patient.name data.assistant.name').lean(),
    HealthReport.countDocuments(filter),
  ]);
  return { items, meta: pageMeta({ page, limit }, total) };
}

async function assertReportAccess(user, reportId) {
  const report = await HealthReport.findById(reportId);
  if (!report) throw ApiError.notFound('Report not found', 'REPORT_NOT_FOUND');
  if (user.role === ROLES.ADMIN) return report;
  if (user.role === ROLES.ASSISTANT && String(report.assistantId) === user.id) return report;
  if (user.role === ROLES.CUSTOMER) {
    await access.assertParentAccess(user, report.parentId, FAMILY_PERMISSIONS.VIEW);
    return report;
  }
  throw ApiError.notFound('Report not found', 'REPORT_NOT_FOUND');
}

async function getForUser(user, reportId) {
  const report = await assertReportAccess(user, reportId);
  const media = await Media.find({ _id: { $in: (report.data.media || []).map((m) => m._id) } }).lean();
  const versions = await HealthReport.find({ bookingId: report.bookingId }).select('_id version reportNumber createdAt').sort({ version: -1 }).lean();
  return { ...report.toJSON(), media: await mediaService.withUrls(media), versions };
}

async function pdfUrl(user, reportId) {
  let report = await assertReportAccess(user, reportId);
  if (report.pdf?.status !== 'READY') report = await generatePdf(report._id);
  const media = await Media.findById(report.pdf.mediaId).lean();
  return { url: await storage.getSignedUrl(media.key), fileName: `${report.reportNumber}.pdf`, expiresInSeconds: 900 };
}

module.exports = { buildReportData, createFromVisit, generatePdf, renderPdf, listForUser, getForUser, pdfUrl, DISCLAIMER };
