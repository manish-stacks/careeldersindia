/** Day-wise / month-wise sheet (the digital version of the paper sheets) as Excel or PDF. */
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { DateTime } = require('luxon');
const { HealthVisit, Booking, Parent, User } = require('../models');
const { env } = require('../config/env');
const { ApiError } = require('../utils/ApiError');

const TTL = 15 * 60;
const sign = (payload) => crypto.createHmac('sha256', env.MEDIA_SIGNING_SECRET).update(payload).digest('base64url');

function makeLink({ parentId, month, date, format }) {
  const payload = Buffer.from(JSON.stringify({ p: String(parentId), m: month, d: date, f: format, e: Math.floor(Date.now() / 1000) + TTL })).toString('base64url');
  return `${env.API_PUBLIC_URL.replace(/\/$/, '')}/api/v1/sheets/file?t=${payload}.${sign(payload)}`;
}

function readLink(token = '') {
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig || sig.length !== sign(payload).length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(payload)))) throw ApiError.forbidden('Link expired or invalid', 'INVALID_SIGNATURE');
  const d = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (d.e < Math.floor(Date.now() / 1000)) throw ApiError.forbidden('Link expired or invalid', 'INVALID_SIGNATURE');
  return { parentId: d.p, month: d.m, date: d.d, format: d.f };
}

async function build(parentId, { month, date }) {
  const parent = await Parent.findById(parentId).select('fullName').lean();
  if (!parent) throw ApiError.notFound('Parent not found', 'PARENT_NOT_FOUND');
  const first = date ? DateTime.fromISO(date, { zone: 'utc' }) : DateTime.fromISO(`${month || DateTime.utc().toFormat('yyyy-MM')}-01`, { zone: 'utc' });
  if (!first.isValid) throw ApiError.badRequest('Invalid date', 'INVALID_DATE');
  const last = date ? first : first.endOf('month');
  const days = [];
  for (let d = first.startOf('day'); d <= last; d = d.plus({ days: 1 })) days.push(d.toISODate());

  const bookings = await Booking.find({ parentId, scheduledAt: { $gte: first.minus({ days: 1 }).toJSDate(), $lte: last.plus({ days: 2 }).toJSDate() } })
    .select('scheduledAt timezone serviceSnapshot.sheets').lean();
  const visits = await HealthVisit.find({ bookingId: { $in: bookings.map((b) => b._id) }, status: 'COMPLETED' }).select('bookingId assistantId reports reportMode').lean();
  const staff = new Map((await User.find({ _id: { $in: visits.map((v) => v.assistantId) } }).select('name').lean()).map((u) => [String(u._id), u.name]));
  const byBooking = new Map(bookings.map((b) => [String(b._id), b]));

  const sheets = new Map(); // serviceId -> { name, kind, labels[], cells: Map(label -> {day: value}) }
  const staffByDay = {};
  const ensure = (id, name, kind) => {
    if (!sheets.has(id)) sheets.set(id, { name, kind, labels: [], cells: new Map(), imageDays: new Set() });
    return sheets.get(id);
  };
  const addLabel = (s, label) => { if (!s.labels.includes(label)) { s.labels.push(label); s.cells.set(label, {}); } };

  for (const v of visits) {
    const b = byBooking.get(String(v.bookingId));
    const day = DateTime.fromJSDate(b.scheduledAt, { zone: b.timezone || 'UTC' }).toISODate();
    if (!days.includes(day)) continue;
    staffByDay[day] = staff.get(String(v.assistantId)) || '';
    for (const snap of b.serviceSnapshot?.sheets || []) {
      const s = ensure(String(snap.serviceId), snap.name, snap.kind);
      snap.items.forEach((i) => addLabel(s, i.label));
    }
    for (const r of v.reports || []) {
      const s = ensure(String(r.templateId), r.name, r.kind);
      if (r.kind === 'CHECKLIST') (r.checked || []).forEach((l) => { addLabel(s, l); s.cells.get(l)[day] = '✓'; });
      else {
        (r.values || []).forEach((x) => { addLabel(s, x.label); if (x.value) s.cells.get(x.label)[day] = x.value; });
        if (v.reportMode === 'IMAGE') s.imageDays.add(day);
      }
    }
  }
  const title = date ? date : first.toFormat('LLLL yyyy');
  return {
    patient: parent.fullName, title, days, staff: staffByDay,
    sheets: [...sheets.values()].map((s) => ({ name: s.name, kind: s.kind, rows: s.labels.map((l) => ({ label: l, values: s.cells.get(l) })), imageDays: [...s.imageDays] })),
  };
}

const dayNo = (iso) => String(Number(iso.slice(8)));

async function toXlsx(data) {
  const wb = new ExcelJS.Workbook();
  if (!data.sheets.length) wb.addWorksheet('Sheet').addRow(['No completed visits for this period']);
  data.sheets.forEach((sh, idx) => {
    const ws = wb.addWorksheet(`${idx + 1}. ${sh.name}`.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
    ws.addRow([sh.name]).font = { bold: true, size: 14 };
    ws.addRow(['Patient', data.patient]);
    ws.addRow(['Period', data.title]);
    ws.addRow([]);
    const head = ws.addRow(['S.No', 'Item', ...data.days.map(dayNo)]);
    head.font = { bold: true };
    sh.rows.forEach((r, i) => ws.addRow([i + 1, r.label, ...data.days.map((d) => r.values[d] || '')]));
    if (sh.imageDays.length) ws.addRow(['', 'Report image uploaded', ...data.days.map((d) => (sh.imageDays.includes(d) ? 'Image' : ''))]);
    const staffRow = ws.addRow(['', 'Staff', ...data.days.map((d) => data.staff[d] || '')]);
    staffRow.font = { bold: true };
    ws.getColumn(1).width = 7; ws.getColumn(2).width = 30;
    data.days.forEach((_, i) => { ws.getColumn(i + 3).width = data.days.length === 1 ? 24 : 9; });
    const lastRow = ws.rowCount;
    for (let r = 5; r <= lastRow; r++) ws.getRow(r).eachCell((c) => { c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; c.alignment = { horizontal: c.col <= 2 ? 'left' : 'center', vertical: 'middle' }; });
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 5 }];
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function toPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 24 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const W = doc.page.width - 48, H = doc.page.height - 48;
    if (!data.sheets.length) doc.fontSize(12).text('No completed visits for this period.');
    data.sheets.forEach((sh, idx) => {
      if (idx) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(14).text(sh.name);
      doc.font('Helvetica').fontSize(9).fillColor('#555').text(`Patient: ${data.patient}    Period: ${data.title}`).fillColor('#000');
      const n = data.days.length, labelW = 170, snoW = 22, dayW = Math.min(90, (W - labelW - snoW) / n), rowH = n === 1 ? 18 : 13, fs = n === 1 ? 9 : 6.5;
      let y = doc.y + 8;
      const cell = (x, yy, w, text, bold) => { doc.rect(x, yy, w, rowH).strokeColor('#999').lineWidth(0.4).stroke(); doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs).fillColor('#000').text(String(text ?? ''), x + 2, yy + (rowH - fs) / 2 - 1, { width: w - 4, height: rowH, lineBreak: false, ellipsis: true }); };
      const row = (cells, bold) => {
        if (y + rowH > H + 24) { doc.addPage(); y = 24; }
        let x = 24; cell(x, y, snoW, cells[0], bold); x += snoW; cell(x, y, labelW, cells[1], bold); x += labelW;
        data.days.forEach((d, i) => { cell(x, y, dayW, cells[2 + i], bold); x += dayW; }); y += rowH;
      };
      row(['No', 'Item', ...data.days.map(dayNo)], true);
      sh.rows.forEach((r, i) => row([i + 1, r.label, ...data.days.map((d) => (r.values[d] === '✓' ? 'x' : r.values[d] || ''))]));
      if (sh.imageDays.length) row(['', 'Report image', ...data.days.map((d) => (sh.imageDays.includes(d) ? 'Img' : ''))]);
      row(['', 'Staff', ...data.days.map((d) => (data.staff[d] || '').split(' ')[0])], true);
    });
    doc.end();
  });
}

async function render(parentId, { month, date, format }) {
  const data = await build(parentId, { month, date });
  const safe = data.patient.replace(/[^\w-]+/g, '_');
  const name = `${safe}_${date || month || data.title.replace(/\s/g, '_')}`;
  return format === 'pdf'
    ? { buffer: await toPdf(data), mime: 'application/pdf', fileName: `${name}.pdf` }
    : { buffer: await toXlsx(data), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName: `${name}.xlsx` };
}

module.exports = { makeLink, readLink, build, render };
