/**
 * Imports the 2 paper sheets as parent services, each with its child items (prices in INR paise):
 *  - "Daily Services Entry Sheet"  (CHECKLIST, 27 procedures)
 *  - "Blood Haematology Report"    (TABLE, 24 parameters; assistant types values or uploads the report image)
 * Replaces the old one-service-per-procedure import (old ones are deleted, or hidden when they already have bookings).
 * Safe to re-run: never overwrites a price or the items you edited in Admin.
 * Usage: npm run seed:services      Env: SERVICE_DEFAULT_PRICE_PAISE (default 50000 = ₹500)
 */
require('dotenv').config();
require('dns').setServers(['1.1.1.1', '8.8.8.8']); // fixes querySrv ECONNREFUSED on some networks
const mongoose = require('mongoose');
const { env } = require('../config/env');
const { Service, Booking } = require('../models');
const { DAILY_SERVICES, HAEMATOLOGY_PARAMS } = require('../config/reportTemplates');

const PRICE = Number(process.env.SERVICE_DEFAULT_PRICE_PAISE || 50000);
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const base = { vitals: [], collectSymptoms: false, collectMedication: false, collectMobility: false, collectWellbeing: false, minPhotos: 0, dailyChecklist: false, labPanel: 'NONE' };

const SHEETS = [
  {
    name: 'Daily Services Entry Sheet', sortOrder: 1, sheetKind: 'CHECKLIST',
    description: 'Procedures and tests performed at the daily home visit. Admin picks which items apply to each client.',
    fields: base,
    items: DAILY_SERVICES.map((label) => ({ key: slugify(label).replace(/-/g, '_'), label })),
  },
  {
    name: 'Blood Haematology Report', sortOrder: 2, sheetKind: 'TABLE',
    description: 'Blood haematology values recorded at home (typed by the assistant or uploaded as a report image).',
    fields: base,
    items: HAEMATOLOGY_PARAMS,
  },
];

(async () => {
  await mongoose.connect(env.MONGO_URI);
  let added = 0;
  for (const s of SHEETS) {
    const slug = slugify(s.name);
    const res = await Service.updateOne({ slug }, { $setOnInsert: { ...s, slug, basePrice: PRICE, currency: 'INR', durationMinutes: 30, isActive: true } }, { upsert: true });
    if (res.upsertedCount) added += 1;
    // earlier import used USD: switch to INR + default price; the service shows only its sheet (no vitals/sections)
    await Service.updateOne({ slug, currency: 'USD' }, { $set: { currency: 'INR', basePrice: PRICE } });
    await Service.updateOne({ slug }, { $set: { fields: base } });
  }
  // retire the old one-service-per-procedure import
  const oldSlugs = [...DAILY_SERVICES.map(slugify), 'daily-home-care-visit'];
  let removed = 0, hidden = 0;
  for (const svc of await Service.find({ slug: { $in: oldSlugs } }).select('_id').lean()) {
    if (await Booking.exists({ serviceId: svc._id })) { await Service.updateOne({ _id: svc._id }, { isActive: false }); hidden += 1; }
    else { await Service.deleteOne({ _id: svc._id }); removed += 1; }
  }
  try { await mongoose.connection.collection('reporttemplates').drop(); } catch { /* collection never existed */ }
  console.log(`Sheets: ${added} added, ${SHEETS.length - added} already existed. Old single services: ${removed} removed, ${hidden} hidden.`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
