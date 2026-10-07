/**
 * Role-aware projections. Least privilege: each role only sees what it needs.
 */
const { ROLES, BOOKING_STATUS: S } = require('../config/constants');
const { ageFromDob } = require('../utils/time');

const plain = (doc) => (doc?.toJSON ? doc.toJSON() : { ...doc });

function assistantPublic(user) {
  if (!user || !user.name) return user ? { id: user._id || user } : null;
  return { id: user._id, name: user.name };
}

function forCustomer(booking) {
  const b = plain(booking);
  delete b.adminNotes;
  delete b.reminders;
  if (b.assignment) b.assignment = { assignedAt: b.assignment.assignedAt, acceptedAt: b.assignment.acceptedAt };
  b.assistant = assistantPublic(b.assistantId);
  delete b.assistantId;
  return b;
}

const EMERGENCY_VISIBLE_FROM = [S.ASSISTANT_ACCEPTED, S.ON_THE_WAY, S.REACHED, S.VISIT_STARTED, S.VISIT_COMPLETED];

function forAssistant(booking) {
  const b = plain(booking);
  const p = b.parentSnapshot || {};
  const job = {
    _id: b._id,
    bookingNumber: b.bookingNumber,
    status: b.status,
    scheduledAt: b.scheduledAt,
    scheduledLocal: b.scheduledLocal,
    timezone: b.timezone,
    durationMinutes: b.durationMinutes,
    service: b.serviceSnapshot,
    address: b.addressSnapshot,
    location: b.locationSnapshot,
    patient: {
      name: p.fullName,
      gender: p.gender,
      age: ageFromDob(p.dateOfBirth),
      bloodGroup: p.bloodGroup,
      medicalConditions: p.medicalConditions,
      allergies: p.allergies,
      medicines: p.medicines,
      specialInstructions: p.specialInstructions,
    },
    customerNotes: b.customerNotes,
    visitId: b.visitId,
    travel: b.travel,
    assignment: { assignedAt: b.assignment?.assignedAt, acceptedAt: b.assignment?.acceptedAt },
  };
  // Contact details only once the assistant has committed to the job
  if (EMERGENCY_VISIBLE_FROM.includes(b.status)) {
    job.patient.mobile = p.mobile;
    job.patient.emergencyContacts = p.emergencyContacts;
  }
  return job;
}

function forRole(role, booking) {
  if (role === ROLES.ADMIN) return plain(booking);
  if (role === ROLES.ASSISTANT) return forAssistant(booking);
  return forCustomer(booking);
}

module.exports = { forCustomer, forAssistant, forRole };
