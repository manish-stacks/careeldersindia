const ROLES = Object.freeze({ CUSTOMER: 'CUSTOMER', ASSISTANT: 'ASSISTANT', ADMIN: 'ADMIN' });
const SYSTEM_ACTOR = 'SYSTEM';

const BOOKING_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  PENDING_ADMIN_VERIFICATION: 'PENDING_ADMIN_VERIFICATION',
  VERIFIED: 'VERIFIED',
  ASSISTANT_ASSIGNED: 'ASSISTANT_ASSIGNED',
  ASSISTANT_ACCEPTED: 'ASSISTANT_ACCEPTED',
  ON_THE_WAY: 'ON_THE_WAY',
  REACHED: 'REACHED',
  VISIT_STARTED: 'VISIT_STARTED',
  VISIT_COMPLETED: 'VISIT_COMPLETED',
  REPORT_GENERATED: 'REPORT_GENERATED',
  COMPLETED: 'COMPLETED',
  CANCELLED_BY_CUSTOMER: 'CANCELLED_BY_CUSTOMER',
  CANCELLED_BY_ADMIN: 'CANCELLED_BY_ADMIN',
  ASSISTANT_REJECTED: 'ASSISTANT_REJECTED',
  NO_SHOW: 'NO_SHOW',
  RESCHEDULED: 'RESCHEDULED',
});

const TERMINAL_STATUSES = [
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED_BY_CUSTOMER,
  BOOKING_STATUS.CANCELLED_BY_ADMIN,
  BOOKING_STATUS.NO_SHOW,
];

// Assistant committed to slot → used for clash detection
const ASSISTANT_BUSY_STATUSES = [
  BOOKING_STATUS.ASSISTANT_ASSIGNED,
  BOOKING_STATUS.ASSISTANT_ACCEPTED,
  BOOKING_STATUS.ON_THE_WAY,
  BOOKING_STATUS.REACHED,
  BOOKING_STATUS.VISIT_STARTED,
];

// Live location shared only in these statuses
const TRACKABLE_STATUSES = [BOOKING_STATUS.ON_THE_WAY, BOOKING_STATUS.REACHED];

const ASSISTANT_VERIFICATION = Object.freeze({
  PENDING: 'PENDING',
  DOCUMENT_REVIEW: 'DOCUMENT_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

const OVERALL_STATUS = Object.freeze({ STABLE: 'STABLE', NEEDS_ATTENTION: 'NEEDS_ATTENTION', URGENT_ATTENTION: 'URGENT_ATTENTION' });

const FAMILY_PERMISSIONS = Object.freeze({ VIEW: 'VIEW', BOOK: 'BOOK', MANAGE: 'MANAGE' });

const PAYMENT_STATUS = Object.freeze({
  CREATED: 'CREATED',
  AUTHORIZED: 'AUTHORIZED',
  CAPTURED: 'CAPTURED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
});

const VITAL_KEYS = ['bp', 'pulse', 'spo2', 'temperature', 'weight', 'bloodSugar'];

// Plausibility limits — reject impossible input. NOT clinical reference ranges.
const VITAL_LIMITS = Object.freeze({
  bpSystolic: [50, 260],
  bpDiastolic: [30, 160],
  pulse: [20, 250],
  spo2: [50, 100],
  temperatureF: [90, 110],
  temperatureC: [32, 43.5],
  weightKg: [20, 250],
  bloodSugarMgDl: [20, 600],
});

const DEFAULT_SYMPTOMS = ['Fever', 'Cough', 'Weakness', 'Dizziness', 'Breathlessness', 'Chest discomfort', 'Pain', 'Swelling', 'Headache', 'Nausea', 'Other'];

const MEDIA_TYPES = ['PRESCRIPTION', 'MEDICINE', 'TEST_REPORT', 'WOUND', 'PROFILE_PHOTO', 'GOV_ID', 'PAN', 'QUALIFICATION', 'REPORT_PDF', 'OTHER'];

const OPERATIONAL_TIMEZONE = 'Asia/Kolkata';

module.exports = {
  ROLES,
  SYSTEM_ACTOR,
  BOOKING_STATUS,
  TERMINAL_STATUSES,
  ASSISTANT_BUSY_STATUSES,
  TRACKABLE_STATUSES,
  ASSISTANT_VERIFICATION,
  OVERALL_STATUS,
  FAMILY_PERMISSIONS,
  PAYMENT_STATUS,
  VITAL_KEYS,
  VITAL_LIMITS,
  DEFAULT_SYMPTOMS,
  MEDIA_TYPES,
  OPERATIONAL_TIMEZONE,
};

/**
 * Screens a notification can open in the mobile app (admin broadcasts + system pushes).
 * `param` = which data key carries the record id. Keep in sync with mobile/src/lib/links.ts.
 */
const APP_SCREENS = Object.freeze({
  home: { roles: ['CUSTOMER'], label: 'Home' },
  visits: { roles: ['CUSTOMER'], label: 'Visits' },
  book: { roles: ['CUSTOMER'], label: 'Book a visit' },
  parents: { roles: ['CUSTOMER'], label: 'Parents' },
  reports: { roles: ['CUSTOMER'], label: 'Reports' },
  plans: { roles: ['CUSTOMER'], label: 'Recurring plans' },
  payments: { roles: ['CUSTOMER'], label: 'Payments' },
  account: { roles: ['CUSTOMER'], label: 'Account' },
  booking: { roles: ['CUSTOMER'], label: 'A visit', param: 'bookingId' },
  report: { roles: ['CUSTOMER'], label: 'A report', param: 'reportId' },
  parent: { roles: ['CUSTOMER'], label: 'A parent', param: 'parentId' },
  plan: { roles: ['CUSTOMER'], label: 'A plan', param: 'planId' },
  today: { roles: ['ASSISTANT'], label: 'Today' },
  jobs: { roles: ['ASSISTANT'], label: 'Jobs' },
  new_jobs: { roles: ['ASSISTANT'], label: 'New jobs to accept' },
  earnings: { roles: ['ASSISTANT'], label: 'Earnings' },
  documents: { roles: ['ASSISTANT'], label: 'Documents' },
  availability: { roles: ['ASSISTANT'], label: 'Availability' },
  profile: { roles: ['ASSISTANT'], label: 'Profile' },
  job: { roles: ['ASSISTANT'], label: 'A job', param: 'bookingId' },
  notifications: { roles: ['CUSTOMER', 'ASSISTANT'], label: 'Notifications' },
  sos: { roles: ['CUSTOMER', 'ASSISTANT'], label: 'Emergency help' },
});
module.exports.APP_SCREENS = APP_SCREENS;
