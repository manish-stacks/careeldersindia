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
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Visit summary ${report.reportNumber}`, Author: 'ParentCare' } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const W = doc.page.width - 96;

  // Header
  doc.rect(0, 0, doc.page.width, 6).fill(C.brand);
  doc.fillColor(C.brand).font('Helvetica-Bold').fontSize(16).text('ParentCare', 48, 30);
  doc.fillColor(C.muted).font('Helvetica').fontSize(9).text(`Report ${report.reportNumber}${report.version > 1 ? ` · v${report.version}` : ''}`, 48, 34, { width: W, align: 'right' });
  doc.moveDown(1.2);
  doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(20).text('Visit summary', 48);
  doc.font('Helvetica').fontSize(10).fillColor(C.muted).text(`${d.service.name} · ${formatLocal(d.visit.completedAt || d.visit.scheduledAt, d.visit.timezone)}`);
  doc.moveDown(0.8);

  // Status pill
  const statusColor = STATUS_COLOR[d.overallStatus] || C.muted;
  const y0 = doc.y;
  doc.roundedRect(48, y0, W, 38, 6).fill(C.tint);
  doc.rect(48, y0, 4, 38).fill(statusColor);
  doc.fillColor(C.muted).fontSize(9).text('Overall status (assistant observation)', 62, y0 + 7);
  doc.fillColor(statusColor).font('Helvetica-Bold').fontSize(13).text(STATUS_LABEL[d.overallStatus] || '—', 62, y0 + 19);
  if (d.followUp?.required) doc.fillColor(C.attention).fontSize(10).text('Follow-up recommended', 48, y0 + 19, { width: W - 14, align: 'right' });
  doc.y = y0 + 52;

  const section = (title) => {
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.moveDown(0.6);
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(11).text(title, 48);
    doc.moveTo(48, doc.y + 3).lineTo(48 + W, doc.y + 3).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.moveDown(0.6);
    doc.font('Helvetica').fontSize(10).fillColor(C.ink);
  };
  const kv = (rows) => {
    rows.forEach(([k, v]) => {
      const y = doc.y;
      doc.fillColor(C.muted).text(k, 48, y, { width: 150 });
      doc.fillColor(C.ink).text(v ?? '—', 200, y, { width: W - 152 });
      doc.moveDown(0.35);
    });
  };

  section('Patient');
  kv([
    ['Name', d.patient.name],
    ['Age / gender', `${d.patient.age ?? '—'} yrs · ${humanise(d.patient.gender)}`],
    ['Blood group', d.patient.bloodGroup],
    ['City', d.patient.city],
  ]);

  section('Visit');
  kv([
    ['Booking', d.visit.bookingNumber],
    ['Scheduled', `${d.visit.scheduledLocal?.date} ${d.visit.scheduledLocal?.time} (India time)`],
    ['Started / completed', `${d.visit.startedAt ? formatLocal(d.visit.startedAt, d.visit.timezone, 'h:mm a') : '—'} – ${d.visit.completedAt ? formatLocal(d.visit.completedAt, d.visit.timezone, 'h:mm a') : '—'}`],
    ['Care assistant', d.assistant.name],
  ]);

  section('Recorded measurements');
  const rows = measurementRows(d.measurements);
  kv(rows.length ? rows : [['—', 'No measurements recorded']]);

  section('Symptoms reported');
  doc.text(d.symptoms?.length ? d.symptoms.join(', ') : 'None reported', 48, doc.y, { width: W });
  if (d.symptomNotes) doc.moveDown(0.3).fillColor(C.muted).text(d.symptomNotes, { width: W });
  if (d.servicesPerformed?.length) doc.moveDown(0.8).fillColor(C.ink).font('Helvetica-Bold').text('Services performed').font('Helvetica').fillColor(C.muted).text(d.servicesPerformed.join(', '), { width: W });
  for (const r of d.reports || []) {
    const rows = r.kind === 'CHECKLIST' ? (r.checked || []).join(', ') : (r.values || []).filter((x) => x.value).map((x) => `${x.label}: ${x.value}`).join('\n');
    if (rows) doc.moveDown(0.8).fillColor(C.ink).font('Helvetica-Bold').text(`${r.name}${r.reportDate ? ` · ${r.reportDate}` : ''}`).font('Helvetica').fillColor(C.muted).text(rows, { width: W });
  }
  if (d.labReport?.values?.length) {
    doc.moveDown(0.8).fillColor(C.ink).font('Helvetica-Bold').text(`Blood haematology${d.labReport.reportDate ? ` · ${d.labReport.reportDate}` : ''}`).font('Helvetica').fillColor(C.muted);
    for (const r of d.labReport.values.filter((x) => x.value)) doc.text(`${r.label}: ${r.value}`, { width: W });
  }
  if (d.reportMode === 'IMAGE') doc.moveDown(0.5).fillColor(C.muted).text('Lab report attached as image(s) — see the Photos section of the visit in the app.', { width: W });

  if (d.medicationStatus?.length) {
    section('Medication record (as reported)');
    kv(d.medicationStatus.map((m) => [`${m.medicineName}`, `${humanise(m.slot)}: ${humanise(m.status)} (reported by ${humanise(m.reportedBy)})`]));
  }

  if (d.mobility || d.wellbeing) {
    section('Assistant observations');
    const w = d.wellbeing || {};
    kv([
      ['Mobility', humanise(d.mobility)],
      ['Appetite', humanise(w.appetite)],
      ['Sleep', humanise(w.sleep)],
      ['Mood', humanise(w.mood)],
      ['Hydration', humanise(w.hydration)],
    ].filter(([, v]) => v !== '—'));
  }

  if (d.notes) {
    section('Assistant notes');
    doc.text(d.notes, 48, doc.y, { width: W });
  }

  if (d.urgent) {
    section('Escalation');
    kv([
      ['Reason', d.urgent.reason],
      ['Notes', d.urgent.notes],
      ['Recommended escalation', humanise(d.urgent.recommendedEscalation)],
    ]);
  }

  if (d.followUp?.required) {
    section('Follow-up');
    doc.text(d.followUp.notes || 'Follow-up recommended by the assistant.', 48, doc.y, { width: W });
  }

  if (images.length) {
    section('Photos & documents');
    let x = 48;
    const size = (W - 24) / 3;
    let rowY = doc.y;
    images.forEach((img, i) => {
      if (i && i % 3 === 0) {
        rowY += size + 20;
        x = 48;
      }
      if (rowY + size > doc.page.height - 80) {
        doc.addPage();
        rowY = 60;
      }
      try {
        doc.image(img.buffer, x, rowY, { fit: [size, size], align: 'center', valign: 'center' });
        doc.fontSize(8).fillColor(C.muted).text(humanise(img.type), x, rowY + size + 4, { width: size });
      } catch {
        /* skip unreadable image */
      }
      x += size + 12;
    });
    doc.y = rowY + size + 24;
  }

  // Disclaimer + footer
  if (doc.y > doc.page.height - 120) doc.addPage();
  doc.moveDown(1);
  doc.fontSize(8.5).fillColor(C.muted).text(d.disclaimer, 48, doc.y, { width: W });
  doc.moveDown(0.4).text(`Generated ${formatLocal(new Date(), d.visit.timezone)}`, { width: W });

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
