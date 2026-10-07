/**
 * Central booking state machine. The ONLY place booking.status may change.
 * - TRANSITIONS: which next states are legal from each state
 * - ACTORS:      which roles may move a booking INTO a state
 * - transition(): atomic compare-and-set on current status → prevents double taps / races
 */
const { Booking } = require('../models');
const { ApiError } = require('../utils/ApiError');
const { BOOKING_STATUS: S, ROLES, SYSTEM_ACTOR } = require('../config/constants');

const CANCELLABLE = [S.CANCELLED_BY_CUSTOMER, S.CANCELLED_BY_ADMIN];

const TRANSITIONS = Object.freeze({
  [S.DRAFT]: [S.PENDING_PAYMENT, S.CANCELLED_BY_CUSTOMER],
  [S.PENDING_PAYMENT]: [S.PAYMENT_SUCCESS, ...CANCELLABLE],
  [S.PAYMENT_SUCCESS]: [S.PENDING_ADMIN_VERIFICATION, S.CANCELLED_BY_ADMIN],
  [S.PENDING_ADMIN_VERIFICATION]: [S.VERIFIED, S.RESCHEDULED, ...CANCELLABLE],
  [S.VERIFIED]: [S.ASSISTANT_ASSIGNED, S.RESCHEDULED, ...CANCELLABLE],
  [S.ASSISTANT_ASSIGNED]: [S.ASSISTANT_ACCEPTED, S.ASSISTANT_REJECTED, S.ASSISTANT_ASSIGNED, S.RESCHEDULED, ...CANCELLABLE],
  [S.ASSISTANT_REJECTED]: [S.ASSISTANT_ASSIGNED, S.RESCHEDULED, S.CANCELLED_BY_ADMIN],
  [S.ASSISTANT_ACCEPTED]: [S.ON_THE_WAY, S.ASSISTANT_ASSIGNED, S.RESCHEDULED, ...CANCELLABLE],
  [S.ON_THE_WAY]: [S.REACHED, S.ASSISTANT_ASSIGNED, S.CANCELLED_BY_ADMIN],
  [S.REACHED]: [S.VISIT_STARTED, S.NO_SHOW, S.CANCELLED_BY_ADMIN],
  [S.VISIT_STARTED]: [S.VISIT_COMPLETED],
  [S.VISIT_COMPLETED]: [S.REPORT_GENERATED],
  [S.REPORT_GENERATED]: [S.COMPLETED],
  // RESCHEDULED is transient: the booking returns to verification at the new time
  [S.RESCHEDULED]: [S.PENDING_ADMIN_VERIFICATION],
  [S.COMPLETED]: [],
  [S.CANCELLED_BY_CUSTOMER]: [],
  [S.CANCELLED_BY_ADMIN]: [],
  [S.NO_SHOW]: [],
});

const A = ROLES.ADMIN;
const ACTORS = Object.freeze({
  [S.PENDING_PAYMENT]: [ROLES.CUSTOMER, SYSTEM_ACTOR],
  [S.PAYMENT_SUCCESS]: [SYSTEM_ACTOR],
  [S.PENDING_ADMIN_VERIFICATION]: [SYSTEM_ACTOR],
  [S.VERIFIED]: [A],
  [S.ASSISTANT_ASSIGNED]: [A],
  [S.ASSISTANT_ACCEPTED]: [ROLES.ASSISTANT, A],
  [S.ASSISTANT_REJECTED]: [ROLES.ASSISTANT, A],
  [S.ON_THE_WAY]: [ROLES.ASSISTANT, A],
  [S.REACHED]: [ROLES.ASSISTANT, A],
  [S.VISIT_STARTED]: [ROLES.ASSISTANT],
  [S.VISIT_COMPLETED]: [ROLES.ASSISTANT],
  [S.NO_SHOW]: [ROLES.ASSISTANT, A],
  [S.REPORT_GENERATED]: [SYSTEM_ACTOR],
  [S.COMPLETED]: [SYSTEM_ACTOR],
  [S.CANCELLED_BY_CUSTOMER]: [ROLES.CUSTOMER],
  [S.CANCELLED_BY_ADMIN]: [A, SYSTEM_ACTOR],
  [S.RESCHEDULED]: [ROLES.CUSTOMER, A],
  [S.DRAFT]: [],
});

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

function canActorTransition(role, to) {
  return (ACTORS[to] || []).includes(role);
}

function assertTransition(from, to, role) {
  if (!canTransition(from, to)) {
    throw ApiError.conflict(`Booking cannot move from ${from} to ${to}`, 'INVALID_STATUS_TRANSITION', { from, to });
  }
  if (!canActorTransition(role, to)) {
    throw ApiError.forbidden(`${role} cannot set booking status to ${to}`, 'TRANSITION_NOT_ALLOWED');
  }
}

/**
 * Atomically apply one or more chained transitions.
 * @param {string|ObjectId} bookingId
 * @param {string[]|string} steps e.g. [RESCHEDULED, PENDING_ADMIN_VERIFICATION]
 * @param {{ actor: {id, role}|'SYSTEM', note?: string, set?: object, expectedFrom?: string, extraFilter?: object }} opts
 */
async function transition(bookingId, steps, { actor, note, set = {}, unset, expectedFrom, extraFilter = {} } = {}) {
  const chain = Array.isArray(steps) ? steps : [steps];
  const current = await Booking.findById(bookingId).select('status').lean();
  if (!current) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  const from = expectedFrom || current.status;

  const isSystem = !actor || actor === SYSTEM_ACTOR;
  const role = isSystem ? SYSTEM_ACTOR : actor.role;
  const actorId = isSystem ? undefined : actor.id;

  const history = [];
  let cursor = from;
  chain.forEach((to, idx) => {
    // chained follow-up steps (e.g. RESCHEDULED → PENDING_ADMIN_VERIFICATION) are system-driven
    assertTransition(cursor, to, idx === 0 ? role : SYSTEM_ACTOR);
    history.push({ from: cursor, to, at: new Date(), actorId, actorRole: idx === 0 ? role : SYSTEM_ACTOR, note });
    cursor = to;
  });

  const update = { $set: { ...set, status: cursor }, $push: { statusHistory: { $each: history } } };
  if (unset) update.$unset = unset;

  const updated = await Booking.findOneAndUpdate({ _id: bookingId, status: from, ...extraFilter }, update, { new: true });
  if (!updated) {
    throw ApiError.conflict('Booking was updated by someone else. Refresh and try again.', 'STATUS_CHANGED_CONCURRENTLY');
  }
  return updated;
}

module.exports = { TRANSITIONS, ACTORS, canTransition, canActorTransition, assertTransition, transition };
