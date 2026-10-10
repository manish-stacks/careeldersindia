const { DateTime } = require('luxon');
const { escapeRegex } = require('./pagination');
const { OPERATIONAL_TIMEZONE } = require('../config/constants');

/** Adds optional search (patient name / booking no.) and from/to (YYYY-MM-DD, IST) filters to a Booking query. */
function applySearchAndDates(filter, query) {
  const q = (query.q || '').trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q.slice(0, 60)), 'i');
    filter.$and = [...(filter.$and || []), { $or: [{ 'parentSnapshot.fullName': rx }, { bookingNumber: rx }] }];
  }
  if (query.from || query.to) {
    const range = {};
    if (query.from) range.$gte = DateTime.fromISO(query.from, { zone: OPERATIONAL_TIMEZONE }).startOf('day').toJSDate();
    if (query.to) range.$lt = DateTime.fromISO(query.to, { zone: OPERATIONAL_TIMEZONE }).startOf('day').plus({ days: 1 }).toJSDate();
    filter.scheduledAt = { ...(filter.scheduledAt || {}), ...range };
  }
  return filter;
}
module.exports = { applySearchAndDates };
