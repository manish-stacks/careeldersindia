const { DateTime } = require('luxon');
const { OPERATIONAL_TIMEZONE } = require('../config/constants');
const { ApiError } = require('./ApiError');

/**
 * Convert a wall-clock date+time in the parent's (operational) timezone into UTC.
 * Appointments are always entered and shown in India time, never the customer's zone.
 */
function localToUtc(date, time, zone = OPERATIONAL_TIMEZONE) {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone });
  if (!dt.isValid) throw ApiError.badRequest('Invalid date or time', 'INVALID_DATETIME');
  return dt.toUTC().toJSDate();
}

function utcToLocalParts(dateUtc, zone = OPERATIONAL_TIMEZONE) {
  const dt = DateTime.fromJSDate(new Date(dateUtc), { zone });
  return { date: dt.toISODate(), time: dt.toFormat('HH:mm') };
}

function formatLocal(dateUtc, zone = OPERATIONAL_TIMEZONE, fmt = "d LLL yyyy, h:mm a") {
  return `${DateTime.fromJSDate(new Date(dateUtc), { zone }).toFormat(fmt)} ${zone === OPERATIONAL_TIMEZONE ? 'IST' : zone}`;
}

function ageFromDob(dob) {
  if (!dob) return undefined;
  return Math.floor(DateTime.now().diff(DateTime.fromJSDate(new Date(dob)), 'years').years);
}

module.exports = { localToUtc, utcToLocalParts, formatLocal, ageFromDob, DateTime };
