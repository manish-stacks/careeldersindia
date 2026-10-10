/**
 * Demo data. `npm run seed` (idempotent-ish: refuses if admin exists) · `npm run seed:reset` (wipes DB first).
 * Needs MongoDB. Redis optional (only used to drop a live location for the ON_THE_WAY visit).
 */
require('dotenv').config();
const zlib = require('zlib');
const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const { connectDB, disconnectDB } = require('../config/db');
const { redis } = require('../config/redis');
const { env } = require('../config/env');
const M = require('../models');
const { nextNumber } = require('../models/Counter');
const { encrypt, last4 } = require('../utils/crypto');
const { hashPassword } = require('../services/auth.service');
const { buildSnapshots } = require('../services/booking.service');
const { occurrenceAt } = require('../services/recurring.service');
const reportService = require('../services/report.service');
const mediaService = require('../services/media.service');
const { measurementDocs } = require('../services/healthVisit.service');
const { BOOKING_STATUS: S, OPERATIONAL_TIMEZONE: TZ } = require('../config/constants');

const RESET = process.argv.includes('--reset');
const log = (...a) => console.log('•', ...a); // eslint-disable-line no-console

// ---------------------------------------------------------------- helpers

/** Minimal valid PNG (solid colour + soft stripe) so pdfkit can embed visit photos. */
function makePng(w, h, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x += 1) {
      const stripe = (x + y) % 24 < 12 ? 0 : 18;
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = Math.min(255, r + stripe);
      raw[o + 1] = Math.min(255, g + stripe);
      raw[o + 2] = Math.min(255, b + stripe);
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** IST wall clock → UTC Date. dayOffset relative to today (IST). */
function ist(dayOffset, time) {
  const [hh, mm] = time.split(':').map(Number);
  return DateTime.now().setZone(TZ).startOf('day').plus({ days: dayOffset }).set({ hour: hh, minute: mm }).toUTC().toJSDate();
}
function localParts(d) {
  const dt = DateTime.fromJSDate(d, { zone: TZ });
  return { date: dt.toISODate(), time: dt.toFormat('HH:mm') };
}
const minutes = (d, m) => new Date(d.getTime() + m * 60000);
const hist = (steps, start, actors = {}) => {
  let prev = 'DRAFT';
  return steps.map((to, i) => {
    const row = { from: prev, to, at: minutes(start, i * 7), actorRole: actors[to]?.role || 'SYSTEM', actorId: actors[to]?.id };
    prev = to;
    return row;
  });
};

// ---------------------------------------------------------------- main

async function main() {
  await connectDB();
  if (RESET) {
    const collections = await mongoose.connection.db.collections();
    for (const c of collections) await c.deleteMany({});
    log(`Reset: cleared ${collections.length} collections`);
  } else if (await M.User.exists({ email: 'admin@careeldersindia.com' })) {
    log('Seed data already present. Run `npm run seed:reset` to start fresh.');
    return;
  }
  for (const model of Object.values(M).filter((m) => m?.syncIndexes)) {
    await model.syncIndexes().catch((err) => log(`Index sync skipped for ${model.modelName}: ${err.message}`));
  }

  // ---------------------------------------------------------------- services
  const services = await M.Service.insertMany([
    {
      name: 'Basic Health Check',
      slug: 'basic-health-check',
      description: 'BP, pulse, SpO2 and temperature recorded at home, with a short wellbeing chat and medicine check.',
      basePrice: 2900,
      durationMinutes: 45,
      recurringDiscountPercent: 10,
      fields: { vitals: [{ key: 'bp' }, { key: 'pulse' }, { key: 'spo2' }, { key: 'temperature', required: false }], collectSymptoms: true, collectMedication: true, collectMobility: false, collectWellbeing: false, minPhotos: 0 },
      sortOrder: 1,
    },
    {
      name: 'Diabetes Care Visit',
      slug: 'diabetes-care-visit',
      description: 'Blood sugar reading plus BP, pulse and weight. Medicine adherence recorded for the family.',
      basePrice: 3500,
      durationMinutes: 60,
      recurringDiscountPercent: 10,
      fields: { vitals: [{ key: 'bloodSugar' }, { key: 'bp' }, { key: 'pulse' }, { key: 'weight', required: false }], collectSymptoms: true, collectMedication: true, collectMobility: false, collectWellbeing: true, minPhotos: 0 },
      sortOrder: 2,
    },
    {
      name: 'Comprehensive Wellness Visit',
      slug: 'comprehensive-wellness-visit',
      description: 'All vitals, mobility and wellbeing check, medicine review with photos of prescriptions and strips.',
      basePrice: 4900,
      durationMinutes: 90,
      recurringDiscountPercent: 15,
      fields: { vitals: [{ key: 'bp' }, { key: 'pulse' }, { key: 'spo2' }, { key: 'temperature' }, { key: 'weight' }, { key: 'bloodSugar', required: false }], collectSymptoms: true, collectMedication: true, collectMobility: true, collectWellbeing: true, minPhotos: 1 },
      sortOrder: 3,
    },
    {
      name: 'Medication & Companion Visit',
      slug: 'medication-companion-visit',
      description: 'A friendly check-in: medicines taken on time, BP and pulse, and an hour of company.',
      basePrice: 1900,
      durationMinutes: 60,
      recurringDiscountPercent: 10,
      fields: { vitals: [{ key: 'bp' }, { key: 'pulse' }], collectSymptoms: true, collectMedication: true, collectMobility: false, collectWellbeing: true, minPhotos: 0 },
      sortOrder: 4,
    },
  ]);
  const [svcBasic, svcDiabetes, svcWellness] = services;
  log(`Services: ${services.length}`);

  // ---------------------------------------------------------------- users
  const [adminHash, custHash, asstHash] = await Promise.all([hashPassword('Admin@12345'), hashPassword('Customer@123'), hashPassword('Assistant@123')]);
  const admin = await M.User.create({ name: 'Kavya Iyer', email: 'admin@careeldersindia.com', mobile: '+919810000001', role: 'ADMIN', passwordHash: adminHash });
  const rohan = await M.User.create({ name: 'Rohan Mehta', email: 'rohan@example.com', mobile: '+14155550123', country: 'US', timezone: 'America/New_York', role: 'CUSTOMER', passwordHash: custHash });
  const priya = await M.User.create({ name: 'Priya Nair', email: 'priya@example.com', mobile: '+447700900123', country: 'GB', timezone: 'Europe/London', role: 'CUSTOMER', passwordHash: custHash });
  const neha = await M.User.create({ name: 'Neha Sharma', email: 'neha@careeldersindia.com', mobile: '+919810000011', role: 'ASSISTANT', passwordHash: asstHash });
  const arjun = await M.User.create({ name: 'Arjun Menon', email: 'arjun@careeldersindia.com', mobile: '+919810000012', role: 'ASSISTANT', passwordHash: asstHash });
  const vikram = await M.User.create({ name: 'Vikram Singh', email: 'vikram@careeldersindia.com', mobile: '+919810000013', role: 'ASSISTANT', passwordHash: asstHash });
  log('Users: 1 admin, 2 customers, 3 assistants');

  const allWeek = (start, end) => [1, 2, 3, 4, 5, 6].map((day) => ({ day, start, end }));
  await M.Assistant.create([
    {
      userId: neha._id,
      verificationStatus: 'APPROVED',
      verificationHistory: [{ from: 'PENDING', to: 'DOCUMENT_REVIEW', by: admin._id }, { from: 'DOCUMENT_REVIEW', to: 'APPROVED', by: admin._id, notes: 'GNM certificate and Aadhaar verified' }],
      gender: 'FEMALE',
      dateOfBirth: new Date('1994-03-12'),
      address: { line1: 'H-14, Sector 23', city: 'Gurugram', state: 'Haryana', pincode: '122017' },
      qualification: 'GNM Nursing',
      experienceYears: 6,
      languages: ['Hindi', 'English', 'Punjabi'],
      serviceAreas: [{ city: 'Gurugram', pincodes: [] }, { city: 'New Delhi', pincodes: ['110075', '110077', '110078'] }],
      workingHours: allWeek('08:00', '19:00'),
      isAvailable: true,
      isOnline: true,
      bank: { accountHolder: 'Neha Sharma', accountNumberEnc: encrypt('50100234567890'), accountLast4: last4('50100234567890'), ifsc: 'HDFC0001234' },
      pan: { numberEnc: encrypt('ABCPS1234K'), last4: last4('ABCPS1234K') },
      rating: { avg: 4.8, count: 42 },
      stats: { completedVisits: 40 },
    },
    {
      userId: arjun._id,
      verificationStatus: 'APPROVED',
      verificationHistory: [{ from: 'PENDING', to: 'DOCUMENT_REVIEW', by: admin._id }, { from: 'DOCUMENT_REVIEW', to: 'APPROVED', by: admin._id }],
      gender: 'MALE',
      dateOfBirth: new Date('1991-08-02'),
      address: { line1: 'Kadavanthra Road', city: 'Kochi', state: 'Kerala', pincode: '682020' },
      qualification: 'B.Sc Nursing',
      experienceYears: 8,
      languages: ['Malayalam', 'English', 'Hindi', 'Tamil'],
      serviceAreas: [{ city: 'Kochi', pincodes: [] }],
      workingHours: allWeek('07:30', '18:30'),
      isAvailable: true,
      bank: { accountHolder: 'Arjun Menon', accountNumberEnc: encrypt('00711002345678'), accountLast4: '5678', ifsc: 'SBIN0000711' },
      rating: { avg: 4.9, count: 57 },
      stats: { completedVisits: 55 },
    },
    {
      userId: vikram._id,
      verificationStatus: 'PENDING',
      gender: 'MALE',
      dateOfBirth: new Date('1998-11-20'),
      address: { line1: 'Janakpuri C-Block', city: 'New Delhi', state: 'Delhi', pincode: '110058' },
      qualification: 'ANM (Auxiliary Nurse Midwife)',
      experienceYears: 2,
      languages: ['Hindi', 'English'],
      serviceAreas: [{ city: 'New Delhi', pincodes: ['110058', '110059', '110018'] }],
      workingHours: allWeek('09:00', '18:00'),
    },
  ]);

  const idPng = makePng(120, 76, [212, 220, 228]);
  for (const [u, num] of [[neha, '482915736204'], [arjun, '739102846511']]) {
    const media = await mediaService.store({ buffer: idPng, mime: 'image/png', size: idPng.length, originalName: 'aadhaar-front.png', type: 'GOV_ID', uploadedBy: u._id, folder: `kyc/${u._id}` });
    await M.AssistantDocument.create({ assistantUserId: u._id, type: 'GOV_ID', mediaId: media._id, numberEnc: encrypt(num), numberLast4: last4(num), status: 'ACCEPTED', reviewedBy: admin._id, reviewedAt: new Date() });
  }
  const vMedia = await mediaService.store({ buffer: idPng, mime: 'image/png', size: idPng.length, originalName: 'qualification.png', type: 'QUALIFICATION', uploadedBy: vikram._id, folder: `kyc/${vikram._id}` });
  await M.AssistantDocument.create({ assistantUserId: vikram._id, type: 'QUALIFICATION', mediaId: vMedia._id, numberEnc: encrypt('ANM-DL-2020-1182'), numberLast4: '1182' });
  log('Assistants: Neha & Arjun APPROVED (GOV_ID), Vikram PENDING (no GOV_ID yet)');

  // ---------------------------------------------------------------- parents + family
  const sushila = await M.Parent.create({
    ownerId: rohan._id,
    fullName: 'Sushila Mehta',
    gender: 'FEMALE',
    dateOfBirth: new Date('1953-06-18'),
    relationToOwner: 'Mother',
    mobile: '+919812345601',
    address: { line1: 'Flat 1203, Tower B, Palm Grove Heights', line2: 'Golf Course Extension Road', landmark: 'Near Sector 56 Metro', city: 'Gurugram', state: 'Haryana', pincode: '122011' },
    location: { type: 'Point', coordinates: [77.1025, 28.4231] },
    bloodGroup: 'B+',
    medicalConditions: ['Hypertension', 'Osteoarthritis (knees)'],
    medicines: [
      { name: 'Amlodipine', dosage: '5 mg', schedule: { morning: true } },
      { name: 'Calcium + Vitamin D3', dosage: '1 tab', schedule: { afternoon: true } },
      { name: 'Paracetamol', dosage: '500 mg as needed', schedule: { night: true }, notes: 'Only if knee pain' },
    ],
    allergies: ['Sulfa drugs'],
    emergencyContacts: [{ name: 'Anil Kapoor (neighbour)', relation: 'Neighbour', mobile: '+919899001122' }, { name: 'Rohan Mehta', relation: 'Son', mobile: '+14155550123' }],
    specialInstructions: 'Walks slowly — please give her time to reach the door. Prefers Hindi.',
  });
  const ramesh = await M.Parent.create({
    ownerId: rohan._id,
    fullName: 'Ramesh Mehta',
    gender: 'MALE',
    dateOfBirth: new Date('1949-01-09'),
    relationToOwner: 'Father',
    mobile: '+919812345602',
    address: sushila.address.toObject(),
    location: sushila.location,
    bloodGroup: 'O+',
    medicalConditions: ['Type 2 diabetes', 'Mild hearing loss'],
    medicines: [
      { name: 'Metformin', dosage: '500 mg', schedule: { morning: true, night: true } },
      { name: 'Atorvastatin', dosage: '10 mg', schedule: { night: true } },
    ],
    allergies: [],
    emergencyContacts: [{ name: 'Anil Kapoor (neighbour)', relation: 'Neighbour', mobile: '+919899001122' }],
    specialInstructions: 'Speak clearly and a little louder. Hearing aid on the side table.',
  });
  const kamala = await M.Parent.create({
    ownerId: priya._id,
    fullName: 'Kamala Nair',
    gender: 'FEMALE',
    dateOfBirth: new Date('1955-10-30'),
    relationToOwner: 'Mother',
    mobile: '+919847001234',
    address: { line1: 'Sreevalsam, 34/2210 A', line2: 'Chilavannur Road', landmark: 'Opp. St. Joseph Church', city: 'Kochi', state: 'Kerala', pincode: '682020' },
    location: { type: 'Point', coordinates: [76.3004, 9.9632] },
    bloodGroup: 'A+',
    medicalConditions: ['Type 2 diabetes', 'Hypothyroidism'],
    medicines: [
      { name: 'Glimepiride', dosage: '1 mg', schedule: { morning: true } },
      { name: 'Levothyroxine', dosage: '50 mcg', schedule: { morning: true }, notes: 'Empty stomach' },
    ],
    allergies: ['Penicillin'],
    emergencyContacts: [{ name: 'Lakshmi (home help)', relation: 'Caregiver', mobile: '+919847009876' }],
    specialInstructions: 'Lives alone with day-time help. Malayalam preferred.',
  });
  await M.FamilyMember.insertMany([
    { parentId: sushila._id, userId: rohan._id, relation: 'Son', permissions: ['VIEW', 'BOOK', 'MANAGE'], isOwner: true },
    { parentId: ramesh._id, userId: rohan._id, relation: 'Son', permissions: ['VIEW', 'BOOK', 'MANAGE'], isOwner: true },
    { parentId: kamala._id, userId: priya._id, relation: 'Daughter', permissions: ['VIEW', 'BOOK', 'MANAGE'], isOwner: true },
    // Priya is a family friend who checks in on Sushila (view only) — demonstrates shared access
    { parentId: sushila._id, userId: priya._id, relation: 'Family friend', permissions: ['VIEW'], invitedBy: rohan._id },
    // Pending invite for someone who has not registered yet
    { parentId: sushila._id, invitedEmail: 'ananya.mehta@example.com', relation: 'Daughter', permissions: ['VIEW', 'BOOK'], status: 'INVITED', invitedBy: rohan._id },
  ]);
  log('Parents: 3 (Sushila & Ramesh → Rohan, Kamala → Priya; Priya has view access to Sushila)');

  // ---------------------------------------------------------------- bookings
  const actor = (u) => ({ id: u._id, role: u.role });
  const paidPrefix = [S.PENDING_PAYMENT, S.PAYMENT_SUCCESS, S.PENDING_ADMIN_VERIFICATION];
  const flows = {
    [S.PENDING_PAYMENT]: [S.PENDING_PAYMENT],
    [S.PENDING_ADMIN_VERIFICATION]: paidPrefix,
    [S.VERIFIED]: [...paidPrefix, S.VERIFIED],
    [S.ASSISTANT_ASSIGNED]: [...paidPrefix, S.VERIFIED, S.ASSISTANT_ASSIGNED],
    [S.ASSISTANT_REJECTED]: [...paidPrefix, S.VERIFIED, S.ASSISTANT_ASSIGNED, S.ASSISTANT_REJECTED],
    [S.ASSISTANT_ACCEPTED]: [...paidPrefix, S.VERIFIED, S.ASSISTANT_ASSIGNED, S.ASSISTANT_ACCEPTED],
    [S.ON_THE_WAY]: [...paidPrefix, S.VERIFIED, S.ASSISTANT_ASSIGNED, S.ASSISTANT_ACCEPTED, S.ON_THE_WAY],
    [S.COMPLETED]: [...paidPrefix, S.VERIFIED, S.ASSISTANT_ASSIGNED, S.ASSISTANT_ACCEPTED, S.ON_THE_WAY, S.REACHED, S.VISIT_STARTED, S.VISIT_COMPLETED, S.REPORT_GENERATED, S.COMPLETED],
    [S.CANCELLED_BY_CUSTOMER]: [...paidPrefix, S.VERIFIED, S.CANCELLED_BY_CUSTOMER],
  };

  async function makePayment({ customer, amount, bookingId, recurringPlanId, capturedAt, method = 'card' }) {
    const n = Math.random().toString(36).slice(2, 12);
    return M.Payment.create({
      receiptNumber: await nextNumber('RCPT'),
      customerId: customer._id,
      purpose: recurringPlanId ? 'RECURRING_PLAN' : 'BOOKING',
      bookingId,
      recurringPlanId,
      amount,
      status: 'CAPTURED',
      razorpay: { orderId: `order_seed${n}`, paymentId: `pay_seed${n}` },
      method,
      capturedAt,
    });
  }

  async function makeBooking({ customer, parent, service, at, status, assistant, plan, occurrenceIndex, notes, paid = true, pricePerVisit }) {
    const snaps = buildSnapshots(parent, service);
    const steps = flows[status];
    const createdAt = minutes(at, -3 * 24 * 60);
    const actors = { [S.VERIFIED]: actor(admin), [S.ASSISTANT_ASSIGNED]: actor(admin), [S.CANCELLED_BY_CUSTOMER]: actor(customer) };
    if (assistant) [S.ASSISTANT_ACCEPTED, S.ASSISTANT_REJECTED, S.ON_THE_WAY, S.REACHED, S.VISIT_STARTED, S.VISIT_COMPLETED].forEach((s) => (actors[s] = actor(assistant)));
    const statusHistory = hist(plan ? steps.filter((s) => ![S.PENDING_PAYMENT, S.PAYMENT_SUCCESS].includes(s)) : steps, createdAt, actors);
    const hasAssistant = assistant && steps.includes(S.ASSISTANT_ASSIGNED);
    const stillAssigned = hasAssistant && status !== S.ASSISTANT_REJECTED;
    const booking = await M.Booking.create({
      bookingNumber: await nextNumber('BK'),
      customerId: customer._id,
      parentId: parent._id,
      serviceId: service._id,
      recurringPlanId: plan?._id,
      occurrenceIndex,
      assistantId: stillAssigned ? assistant._id : undefined,
      scheduledAt: at,
      endsAt: minutes(at, service.durationMinutes),
      scheduledLocal: localParts(at),
      durationMinutes: service.durationMinutes,
      status,
      statusHistory,
      paymentStatus: plan ? 'PREPAID_PLAN' : paid && status !== S.PENDING_PAYMENT ? 'PAID' : 'UNPAID',
      price: { amount: pricePerVisit ?? service.basePrice, discount: plan ? service.basePrice - pricePerVisit : 0 },
      ...snaps,
      customerNotes: notes,
      assignment: hasAssistant
        ? {
            assignedAt: minutes(createdAt, 60),
            assignedBy: admin._id,
            acceptedAt: steps.includes(S.ASSISTANT_ACCEPTED) ? minutes(createdAt, 90) : undefined,
            history: [{ assistantId: assistant._id, assignedBy: admin._id, assignedAt: minutes(createdAt, 60), outcome: status === S.ASSISTANT_REJECTED ? 'REJECTED' : steps.includes(S.ASSISTANT_ACCEPTED) ? 'ACCEPTED' : 'PENDING', reason: status === S.ASSISTANT_REJECTED ? 'Family function that day, not available' : undefined }],
          }
        : undefined,
      travel: steps.includes(S.ON_THE_WAY) ? { startedAt: minutes(at, -35), reachedAt: steps.includes(S.REACHED) ? minutes(at, -3) : undefined } : undefined,
      cancellation: status === S.CANCELLED_BY_CUSTOMER ? { by: customer._id, role: 'CUSTOMER', reason: 'Dad is travelling to Jaipur that week', at: minutes(at, -4 * 24 * 60) } : undefined,
      createdAt,
    });
    if (!plan && paid && status !== S.PENDING_PAYMENT) {
      const payment = await makePayment({ customer, amount: booking.price.amount, bookingId: booking._id, capturedAt: minutes(createdAt, 4) });
      booking.paymentId = payment._id;
      await booking.save();
    }
    return booking;
  }

  const visitPhoto = makePng(160, 120, [236, 226, 214]);
  async function completeVisit(booking, assistant, v) {
    const startedAt = minutes(booking.scheduledAt, 2);
    const completedAt = minutes(startedAt, booking.durationMinutes - 5);
    const visit = await M.HealthVisit.create({
      bookingId: booking._id,
      parentId: booking.parentId,
      assistantId: assistant._id,
      serviceId: booking.serviceId,
      status: 'COMPLETED',
      startedAt,
      completedAt,
      completionKey: `seed-${booking.bookingNumber}`,
      ...v,
    });
    if (v.photo) {
      const media = await mediaService.store({ buffer: visitPhoto, mime: 'image/png', size: visitPhoto.length, originalName: 'medicine-strip.png', type: 'MEDICINE', caption: v.photo, uploadedBy: assistant._id, folder: 'visits', bookingId: booking._id, visitId: visit._id, parentId: booking.parentId });
      visit.mediaIds.push(media._id);
      await visit.save();
    }
    const media = await M.Media.find({ _id: { $in: visit.mediaIds } }).lean();
    const report = await M.HealthReport.create({
      reportNumber: await nextNumber('HR'),
      bookingId: booking._id,
      visitId: visit._id,
      parentId: booking.parentId,
      customerId: booking.customerId,
      assistantId: assistant._id,
      serviceName: booking.serviceSnapshot.name,
      visitDate: completedAt,
      overallStatus: visit.overallStatus,
      followUpRequired: visit.followUpRequired,
      data: reportService.buildReportData(visit, booking, assistant, media),
    });
    await reportService.generatePdf(report._id);
    await M.HealthMeasurement.insertMany(measurementDocs(visit));
    await M.Booking.updateOne({ _id: booking._id }, { $set: { visitId: visit._id, reportId: report._id, completedAt } });
    await M.Parent.updateOne({ _id: booking.parentId, $or: [{ lastVisitAt: null }, { lastVisitAt: { $lt: completedAt } }] }, { $set: { lastVisitAt: completedAt, lastOverallStatus: visit.overallStatus } });
    return { visit, report };
  }

  // Sushila (Rohan) — history + live + upcoming with Neha
  const b1 = await makeBooking({ customer: rohan, parent: sushila, service: svcBasic, at: ist(-21, '10:00'), status: S.COMPLETED, assistant: neha });
  await completeVisit(b1, neha, {
    measurements: { bp: { systolic: 138, diastolic: 86 }, pulse: 78, spo2: 97, temperature: { value: 98.2, unit: 'F' } },
    symptoms: ['Pain'],
    symptomNotes: 'Mild right knee pain after climbing stairs.',
    medicationStatus: [
      { medicineName: 'Amlodipine', slot: 'MORNING', status: 'TAKEN', reportedBy: 'PATIENT' },
      { medicineName: 'Calcium + Vitamin D3', slot: 'AFTERNOON', status: 'NOT_DUE', reportedBy: 'ASSISTANT' },
    ],
    notes: 'Cheerful and chatty. Home is well lit. Suggested using the handrail on stairs.',
    overallStatus: 'STABLE',
  });
  const b2 = await makeBooking({ customer: rohan, parent: sushila, service: svcWellness, at: ist(-7, '11:00'), status: S.COMPLETED, assistant: neha });
  const r2 = await completeVisit(b2, neha, {
    measurements: { bp: { systolic: 152, diastolic: 94 }, pulse: 84, spo2: 96, temperature: { value: 98.6, unit: 'F' }, weight: { value: 64.5, unit: 'KG' } },
    symptoms: ['Headache', 'Dizziness'],
    symptomNotes: 'Reports occasional light-headedness in the mornings for 3 days.',
    medicationStatus: [
      { medicineName: 'Amlodipine', slot: 'MORNING', status: 'MISSED', reportedBy: 'PATIENT' },
      { medicineName: 'Calcium + Vitamin D3', slot: 'AFTERNOON', status: 'TAKEN', reportedBy: 'PATIENT' },
    ],
    mobility: 'NEEDS_SUPPORT',
    wellbeing: { appetite: 'GOOD', sleep: 'DISTURBED', mood: 'CALM', hydration: 'LOW' },
    notes: 'Missed BP tablet two mornings this week (strip checked). BP reading higher than last visit. Family may want to speak to her doctor.',
    overallStatus: 'NEEDS_ATTENTION',
    followUpRequired: true,
    followUpNotes: 'Re-check BP in 3–4 days; confirm with family doctor.',
    photo: 'Amlodipine strip — 2 tablets remaining from this week',
  });
  const liveAt = minutes(new Date(Math.ceil(Date.now() / (15 * 60000)) * 15 * 60000), 30);
  const b3 = await makeBooking({ customer: rohan, parent: sushila, service: svcBasic, at: liveAt, status: S.ON_THE_WAY, assistant: neha, notes: 'BP re-check after last visit' });
  const b4 = await makeBooking({ customer: rohan, parent: sushila, service: svcBasic, at: ist(6, '10:30'), status: S.ASSISTANT_ACCEPTED, assistant: neha });

  // Ramesh (Rohan) — ops queues
  const b5 = await makeBooking({ customer: rohan, parent: ramesh, service: svcDiabetes, at: ist(2, '09:00'), status: S.PENDING_ADMIN_VERIFICATION, notes: 'Please check his feet as well — he complained of tingling.' });
  const b6 = await makeBooking({ customer: rohan, parent: ramesh, service: svcBasic, at: ist(3, '16:00'), status: S.VERIFIED });
  const b7 = await makeBooking({ customer: rohan, parent: ramesh, service: svcDiabetes, at: ist(-2, '09:30'), status: S.CANCELLED_BY_CUSTOMER });
  const b8 = await makeBooking({ customer: rohan, parent: ramesh, service: svcWellness, at: ist(9, '11:00'), status: S.PENDING_PAYMENT, paid: false });

  // refund for b7
  const p7 = await M.Payment.findById(b7.paymentId);
  const refund7 = await M.Refund.create({ paymentId: p7._id, bookingId: b7._id, amount: p7.amount, reason: `${b7.bookingNumber}: Dad is travelling to Jaipur that week`, status: 'PROCESSED', razorpayRefundId: `rfnd_seed${Date.now().toString(36)}`, createdBy: rohan._id });
  p7.refundedAmount = p7.amount;
  p7.status = 'REFUNDED';
  await p7.save();
  await M.Booking.updateOne({ _id: b7._id }, { paymentStatus: 'REFUNDED' });

  // Kamala (Priya) — recurring weekly diabetes plan with Arjun
  const planStart = DateTime.now().setZone(TZ).minus({ days: 5 }).toISODate();
  const pricePerVisit = svcDiabetes.basePrice - Math.round((svcDiabetes.basePrice * svcDiabetes.recurringDiscountPercent) / 100);
  const plan = await M.RecurringPlan.create({
    planNumber: await nextNumber('RP'),
    customerId: priya._id,
    parentId: kamala._id,
    serviceId: svcDiabetes._id,
    frequency: 'WEEKLY',
    startDate: planStart,
    timeOfDay: '09:30',
    timezone: TZ,
    totalVisits: 8,
    generatedCount: 3,
    pricePerVisit,
    totalAmount: pricePerVisit * 8,
    status: 'ACTIVE',
    notes: 'Fasting sugar every week please — Amma has breakfast after 10.',
  });
  plan.nextOccurrenceAt = occurrenceAt(plan, 3);
  const planPayment = await makePayment({ customer: priya, amount: plan.totalAmount, recurringPlanId: plan._id, capturedAt: DateTime.now().minus({ days: 8 }).toJSDate(), method: 'upi' });
  plan.paymentId = planPayment._id;
  await plan.save();

  const b9 = await makeBooking({ customer: priya, parent: kamala, service: svcDiabetes, at: occurrenceAt(plan, 0), status: S.COMPLETED, assistant: arjun, plan, occurrenceIndex: 0, pricePerVisit });
  const urgent = await completeVisit(b9, arjun, {
    measurements: { bp: { systolic: 104, diastolic: 66 }, pulse: 102, bloodSugar: { value: 58, unit: 'mg/dL', context: 'FASTING' }, weight: { value: 58.2, unit: 'KG' } },
    symptoms: ['Weakness', 'Dizziness'],
    symptomNotes: 'Sweating and shaky on arrival; said she took her tablet but skipped dinner last night.',
    medicationStatus: [
      { medicineName: 'Glimepiride', slot: 'MORNING', status: 'TAKEN', reportedBy: 'PATIENT' },
      { medicineName: 'Levothyroxine', slot: 'MORNING', status: 'TAKEN', reportedBy: 'CAREGIVER' },
    ],
    wellbeing: { appetite: 'POOR', sleep: 'GOOD', mood: 'ANXIOUS', hydration: 'LOW' },
    notes: 'Gave her juice as per family instruction sheet; she felt better in 15 minutes. Caregiver Lakshmi informed.',
    overallStatus: 'URGENT_ATTENTION',
    urgent: { reason: 'Low fasting sugar reading with sweating and shakiness', notes: 'Recorded 58 mg/dL fasting. Symptoms eased after juice. Family should contact her doctor today.', recommendedEscalation: 'CALL_DOCTOR' },
    followUpRequired: true,
    followUpNotes: 'Family to call her doctor about the morning tablet timing.',
  });
  const b10 = await makeBooking({ customer: priya, parent: kamala, service: svcDiabetes, at: occurrenceAt(plan, 1), status: S.ASSISTANT_ASSIGNED, assistant: arjun, plan, occurrenceIndex: 1, pricePerVisit });
  const b11 = await makeBooking({ customer: priya, parent: kamala, service: svcDiabetes, at: occurrenceAt(plan, 2), status: S.ASSISTANT_REJECTED, assistant: arjun, plan, occurrenceIndex: 2, pricePerVisit });
  log('Bookings: 11 across COMPLETED, ON_THE_WAY, ACCEPTED, ASSIGNED, REJECTED, VERIFIED, PENDING_VERIFICATION, PENDING_PAYMENT, CANCELLED');

  // live location for the ON_THE_WAY visit (Neha ~2.4 km away)
  const neLoc = { assistantId: String(neha._id), bookingId: String(b3._id), latitude: 28.4412, longitude: 77.0918, accuracy: 12, heading: 140, speed: 7.5, timestamp: new Date().toISOString() };
  await M.LocationPing.create({ assistantId: neha._id, bookingId: b3._id, location: { type: 'Point', coordinates: [neLoc.longitude, neLoc.latitude] }, accuracy: 12, heading: 140, speed: 7.5, timestamp: new Date() });
  try {
    await Promise.race([
      redis.multi().set(`assistant:location:${neha._id}`, JSON.stringify(neLoc), 'EX', 600).set(`booking:location:${b3._id}`, JSON.stringify(neLoc), 'EX', 600).exec(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
    ]);
    log('Live location for ON_THE_WAY visit written to Redis (expires in 10 min)');
  } catch {
    log('Redis unavailable — skipped live location');
  }

  // ---------------------------------------------------------------- emergency, notifications, audit
  await M.EmergencyAlert.create({
    type: 'HEALTH_URGENT',
    raisedBy: arjun._id,
    raisedByRole: 'ASSISTANT',
    bookingId: b9._id,
    parentId: kamala._id,
    customerId: priya._id,
    assistantId: arjun._id,
    message: 'Low fasting sugar reading with sweating and shakiness — Recorded 58 mg/dL fasting. Symptoms eased after juice.',
    status: 'OPEN',
    escalations: [
      { channel: 'ADMIN_PUSH', target: 'admins', status: 'SENT', at: urgent.visit.completedAt },
      { channel: 'CUSTOMER_PUSH', target: String(priya._id), status: 'SENT', at: urgent.visit.completedAt },
      { channel: 'CALL_LIST', target: 'Lakshmi (home help) +919847009876', status: 'PENDING', at: urgent.visit.completedAt },
    ],
  });
  await M.EmergencyAlert.create({
    type: 'SOS',
    raisedBy: neha._id,
    raisedByRole: 'ASSISTANT',
    message: 'Society guard not allowing entry, need help calling the family',
    status: 'RESOLVED',
    acknowledgedBy: admin._id,
    acknowledgedAt: minutes(b1.scheduledAt, -8),
    resolvedBy: admin._id,
    resolvedAt: minutes(b1.scheduledAt, -2),
    resolutionNotes: 'Called neighbour Anil Kapoor, guard allowed entry.',
    bookingId: b1._id,
    parentId: sushila._id,
    customerId: rohan._id,
    assistantId: neha._id,
    createdAt: minutes(b1.scheduledAt, -10),
  });

  const note = (userId, type, title, body, data = {}, read = false) => ({ userId, type, title, body, data, readAt: read ? new Date() : undefined });
  await M.Notification.insertMany([
    note(rohan._id, 'REPORT_READY', "Sushila Mehta's visit report is ready", 'Visit completed. Recorded status: needs attention. Tap to view the report.', { bookingId: String(b2._id), reportId: String(r2.report._id) }),
    note(rohan._id, 'ASSISTANT_ON_THE_WAY', 'Assistant on the way', 'Neha Sharma is on the way to Sushila Mehta. Track live in the app.', { bookingId: String(b3._id) }),
    note(rohan._id, 'BOOKING_CANCELLED', 'Visit cancelled', `${b7.bookingNumber} has been cancelled. A refund has been initiated.`, { bookingId: String(b7._id) }, true),
    note(priya._id, 'URGENT_HEALTH_ALERT', 'Urgent: Kamala Nair', 'Assistant recorded urgent attention needed. Recommended: call doctor. Our care team will call you shortly.', { bookingId: String(b9._id) }),
    note(priya._id, 'ASSISTANT_ASSIGNED', 'Care assistant assigned', `Arjun Menon will visit Kamala Nair.`, { bookingId: String(b10._id) }, true),
    note(neha._id, 'NEW_JOB', 'New health visit', 'Sushila Mehta · Basic Health Check', { bookingId: String(b4._id) }, true),
    note(arjun._id, 'NEW_JOB', 'New health visit', 'Kamala Nair · Diabetes Care Visit', { bookingId: String(b10._id) }),
    note(vikram._id, 'ADMIN_MESSAGE', 'Welcome to Care Elders India', 'Upload your government ID to complete verification.'),
    note(admin._id, 'URGENT_HEALTH_ALERT', 'Urgent: Kamala Nair', 'Assistant recorded urgent attention needed. Recommended: call doctor.', { bookingId: String(b9._id) }),
    note(admin._id, 'NEW_BOOKING', 'New booking', `${b5.bookingNumber} · Ramesh Mehta · Diabetes Care Visit`, { bookingId: String(b5._id) }),
    note(admin._id, 'JOB_REJECTED_BY_ASSISTANT', 'Job rejected — reassign', `Arjun Menon rejected ${b11.bookingNumber}: Family function that day, not available`, { bookingId: String(b11._id) }),
    note(admin._id, 'ASSISTANT_SIGNUP', 'New assistant signup', 'Vikram Singh is waiting for verification', { assistantId: String(vikram._id) }),
  ]);

  const a = (actorU, action, entityType, entityId, metadata = {}, at = new Date()) => ({ actorId: actorU?._id, actorRole: actorU ? actorU.role : 'SYSTEM', action, entityType, entityId, metadata, createdAt: at });
  await M.AuditLog.insertMany([
    a(admin, 'ADMIN_LOGIN', 'User', admin._id),
    a(admin, 'ASSISTANT_APPROVED', 'User', neha._id, { from: 'DOCUMENT_REVIEW', to: 'APPROVED' }, DateTime.now().minus({ days: 60 }).toJSDate()),
    a(admin, 'ASSISTANT_APPROVED', 'User', arjun._id, { from: 'DOCUMENT_REVIEW', to: 'APPROVED' }, DateTime.now().minus({ days: 45 }).toJSDate()),
    a(rohan, 'PARENT_CREATED', 'Parent', sushila._id),
    a(rohan, 'PARENT_CREATED', 'Parent', ramesh._id),
    a(priya, 'PARENT_CREATED', 'Parent', kamala._id),
    a(rohan, 'FAMILY_MEMBER_INVITED', 'Parent', sushila._id, { email: 'priya@example.com', permissions: ['VIEW'] }),
    a(null, 'PAYMENT_CAPTURED', 'Payment', planPayment._id, { amount: planPayment.amount, source: 'webhook' }),
    a(admin, 'BOOKING_VERIFIED', 'Booking', b6._id),
    a(admin, 'ASSISTANT_ASSIGNED', 'Booking', b4._id, { assistantId: String(neha._id) }),
    a(neha, 'JOB_ACCEPTED', 'Booking', b4._id),
    a(neha, 'TRAVEL_STARTED', 'Booking', b3._id),
    a(arjun, 'JOB_REJECTED', 'Booking', b11._id, { reason: 'Family function that day, not available' }),
    a(arjun, 'VISIT_COMPLETED', 'HealthVisit', urgent.visit._id, { bookingId: String(b9._id), overallStatus: 'URGENT_ATTENTION' }),
    a(rohan, 'BOOKING_CANCELLED', 'Booking', b7._id, { reason: 'Dad is travelling to Jaipur that week', refund: p7.amount }),
    a(rohan, 'PAYMENT_REFUNDED', 'Payment', p7._id, { amount: p7.amount, refundId: String(refund7._id) }),
  ]);

  // eslint-disable-next-line no-console
  console.log(`
────────────────────────────────────────────────────────────
 Care Elders India demo data ready
────────────────────────────────────────────────────────────
 Admin      admin@careeldersindia.com     Admin@12345      (admin dashboard)
 Customer   rohan@example.com       Customer@123     (Sushila + Ramesh)
 Customer   priya@example.com       Customer@123     (Kamala, weekly plan)
 Assistant  neha@careeldersindia.com      Assistant@123    APPROVED · Gurugram
 Assistant  arjun@careeldersindia.com     Assistant@123    APPROVED · Kochi
 Assistant  vikram@careeldersindia.com    Assistant@123    PENDING  · New Delhi
────────────────────────────────────────────────────────────
 Queues: 1 pending verification · 1 verified/unassigned · 1 rejected (reassign)
         1 awaiting acceptance · 1 live (ON_THE_WAY) · 1 URGENT alert open
 Storage: ${env.STORAGE_DRIVER} (${env.STORAGE_DRIVER === 'local' ? env.STORAGE_LOCAL_DIR : env.STORAGE_BUCKET})
────────────────────────────────────────────────────────────`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDB().catch(() => {});
    redis.disconnect();
  });
