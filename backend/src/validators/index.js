const { z, objectId, date, time, mobile, email, password, pincode, pageQuery, idParam, address } = require('./common');
const healthVisit = require('./healthVisit.validators');
const { VITAL_KEYS, ASSISTANT_VERIFICATION, APP_SCREENS } = require('../config/constants');

const workingHours = z
  .array(z.object({ day: z.number().int().min(0).max(6), start: time, end: time }).refine((w) => w.start < w.end, { message: 'start must be before end' }))
  .max(14);
const serviceAreas = z.array(z.object({ city: z.string().trim().min(2).max(80), pincodes: z.array(pincode).max(200).default([]) })).max(20);

const auth = {
  registerCustomer: z.object({
    name: z.string().trim().min(2).max(120),
    email,
    mobile: mobile.optional(),
    password,
    country: z.string().trim().length(2).toUpperCase().default('IN'),
    timezone: z.string().trim().max(60).default('Asia/Kolkata'),
  }),
  registerAssistant: z.object({
    name: z.string().trim().min(2).max(120),
    email,
    mobile,
    password,
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
    dateOfBirth: z.coerce.date(),
    address: z.object({ line1: z.string().trim().min(3).max(200), line2: z.string().trim().max(200).optional(), city: z.string().trim().min(2).max(80), state: z.string().trim().min(2).max(80), pincode }),
    qualification: z.string().trim().max(200).optional(),
    experienceYears: z.number().int().min(0).max(60).default(0),
    languages: z.array(z.string().trim().max(40)).max(10).default([]),
    serviceAreas: serviceAreas.default([]),
  }),
  login: z.object({ identifier: z.string().trim().min(3).max(120), password: z.string().min(1).max(72), portal: z.enum(['ADMIN', 'MOBILE']).default('MOBILE') }),
  refresh: z.object({ refreshToken: z.string().min(20).optional() }),
  forgot: z.object({ identifier: z.string().trim().min(3).max(120) }),
  reset: z.object({ identifier: z.string().trim().min(3).max(120), otp: z.string().regex(/^\d{6}$/), newPassword: password }),
  changePassword: z.object({ currentPassword: z.string().min(1), newPassword: password }),
  updateMe: z.object({ name: z.string().trim().min(2).max(120).optional(), mobile: mobile.optional(), timezone: z.string().trim().max(60).optional(), country: z.string().trim().length(2).toUpperCase().optional() }),
};

const medicine = z.object({
  name: z.string().trim().min(1).max(120),
  dosage: z.string().trim().max(80).optional(),
  schedule: z.object({ morning: z.boolean().default(false), afternoon: z.boolean().default(false), evening: z.boolean().default(false), night: z.boolean().default(false) }).default({}),
  notes: z.string().trim().max(300).optional(),
});
const parentBase = z.object({
  fullName: z.string().trim().min(2).max(120),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  dateOfBirth: z.coerce.date().refine((d) => d < new Date(), 'Date of birth must be in the past'),
  relationToOwner: z.string().trim().max(40).optional(),
  mobile: mobile.optional(),
  address,
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN']).default('UNKNOWN'),
  medicalConditions: z.array(z.string().trim().max(100)).max(30).default([]),
  medicines: z.array(medicine).max(40).default([]),
  allergies: z.array(z.string().trim().max(100)).max(30).default([]),
  emergencyContacts: z.array(z.object({ name: z.string().trim().min(2).max(120), relation: z.string().trim().max(40).optional(), mobile })).min(1, 'Add at least one emergency contact').max(5),
  specialInstructions: z.string().trim().max(2000).optional(),
});
const parent = {
  create: parentBase,
  // no defaults on update — only sent fields change
  update: z
    .object({
      fullName: parentBase.shape.fullName,
      gender: parentBase.shape.gender,
      dateOfBirth: parentBase.shape.dateOfBirth,
      relationToOwner: parentBase.shape.relationToOwner,
      mobile: mobile,
      address: address.partial(),
      latitude: parentBase.shape.latitude,
      longitude: parentBase.shape.longitude,
      bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN']),
      medicalConditions: z.array(z.string().trim().max(100)).max(30),
      medicines: z.array(medicine).max(40),
      allergies: z.array(z.string().trim().max(100)).max(30),
      emergencyContacts: parentBase.shape.emergencyContacts,
      specialInstructions: parentBase.shape.specialInstructions,
    })
    .partial(),
  invite: z.object({ email, relation: z.string().trim().max(40).optional(), permissions: z.array(z.enum(['VIEW', 'BOOK', 'MANAGE'])).default(['VIEW']) }),
  updateMember: z.object({ permissions: z.array(z.enum(['VIEW', 'BOOK', 'MANAGE'])).optional(), relation: z.string().trim().max(40).optional() }),
  memberParams: z.object({ id: objectId, memberId: objectId }),
  history: z.object({ from: z.string().optional(), to: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).optional() }),
};

const booking = {
  create: z.object({ parentId: objectId, serviceId: objectId, itemKeys: z.array(z.string().max(60)).max(150).optional(), date, time, customerNotes: z.string().trim().max(1000).optional() }),
  list: pageQuery.extend({ scope: z.enum(['upcoming', 'past', 'all']).optional(), status: z.string().optional(), parentId: objectId.optional() }),
  cancel: z.object({ reason: z.string().trim().min(3).max(500) }),
  reschedule: z.object({ date, time, reason: z.string().trim().min(3).max(500) }),
};

const recurring = {
  create: z.object({
    parentId: objectId,
    serviceId: objectId,
    itemKeys: z.array(z.string().max(60)).max(150).optional(),
    frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM']),
    intervalDays: z.number().int().min(1).max(90).optional(),
    startDate: date,
    time,
    totalVisits: z.number().int().min(2).max(104),
    notes: z.string().trim().max(1000).optional(),
  }),
  preview: z.object({ frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM']), intervalDays: z.coerce.number().int().min(1).max(90).optional(), startDate: date, time, totalVisits: z.coerce.number().int().min(2).max(104) }),
  cancel: z.object({ reason: z.string().trim().min(3).max(500) }),
};

const payment = {
  createOrder: z.object({ bookingId: objectId.optional(), recurringPlanId: objectId.optional() }).refine((v) => Boolean(v.bookingId) !== Boolean(v.recurringPlanId), 'Provide exactly one of bookingId or recurringPlanId'),
  verify: z.object({ razorpay_order_id: z.string().min(5), razorpay_payment_id: z.string().min(5), razorpay_signature: z.string().min(10) }),
  refund: z.object({ amount: z.number().int().positive().optional(), reason: z.string().trim().min(3).max(300) }),
};

const assistant = {
  updateProfile: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
    dateOfBirth: z.coerce.date().optional(),
    address: z.object({ line1: z.string().trim().max(200), line2: z.string().trim().max(200).optional(), city: z.string().trim().max(80), state: z.string().trim().max(80), pincode }).optional(),
    qualification: z.string().trim().max(200).optional(),
    experienceYears: z.number().int().min(0).max(60).optional(),
    languages: z.array(z.string().trim().max(40)).max(10).optional(),
    serviceAreas: serviceAreas.optional(),
    bank: z.object({ accountHolder: z.string().trim().max(120).optional(), accountNumber: z.string().trim().regex(/^\d{9,18}$/).optional(), ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/).optional(), upiId: z.string().trim().max(80).optional() }).optional(),
    panNumber: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/).optional(),
  }),
  availability: z.object({ isAvailable: z.boolean().optional(), workingHours: workingHours.optional() }),
  acceptMany: z.object({ ids: z.array(objectId).min(1).max(50) }),
  document: z.object({ type: z.enum(['GOV_ID', 'PAN', 'QUALIFICATION', 'PROFILE_PHOTO', 'OTHER']), documentNumber: z.string().trim().min(4).max(40) }),
  jobs: pageQuery.extend({ scope: z.enum(['today', 'upcoming', 'history', 'new']).default('upcoming') }),
  reject: z.object({ reason: z.string().trim().min(3).max(500) }),
  reached: z.object({ latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional() }),
  noShow: z.object({ reason: z.string().trim().min(3).max(500) }),
  location: z.object({ bookingId: objectId, latitude: z.number(), longitude: z.number(), accuracy: z.number().optional(), heading: z.number().optional(), speed: z.number().optional(), timestamp: z.union([z.number(), z.string()]).optional() }),
  visitMedia: z.object({ type: z.enum(['PRESCRIPTION', 'MEDICINE', 'TEST_REPORT', 'WOUND', 'OTHER']).default('OTHER'), caption: z.string().trim().max(300).optional() }),
  earnings: z.object({ months: z.coerce.number().int().min(1).max(12).optional() }),
};

const serviceFields = z.object({
  vitals: z.array(z.object({ key: z.enum(VITAL_KEYS), required: z.boolean().default(true) })).max(VITAL_KEYS.length).default([]),
  dailyChecklist: z.boolean().default(false),
  labPanel: z.enum(['NONE', 'HAEMATOLOGY']).default('NONE'),
  collectSymptoms: z.boolean().default(true),
  collectMedication: z.boolean().default(true),
  collectMobility: z.boolean().default(false),
  collectWellbeing: z.boolean().default(false),
  minPhotos: z.number().int().min(0).max(10).default(0),
});
const serviceBody = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers and dashes'),
  description: z.string().trim().max(2000).optional(),
  basePrice: z.number().int().min(0),
  durationMinutes: z.number().int().min(15).max(480),
  recurringDiscountPercent: z.number().min(0).max(50).default(0),
  fields: serviceFields.default({}),
  sheetKind: z.enum(['NONE', 'CHECKLIST', 'TABLE']).default('NONE'),
  items: z.array(z.string().trim().min(1).max(80)).max(150).default([]),
  symptomsList: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const admin = {
  service: serviceBody,
  serviceUpdate: z
    .object({
      name: serviceBody.shape.name,
      slug: serviceBody.shape.slug,
      description: serviceBody.shape.description,
      basePrice: serviceBody.shape.basePrice,
      durationMinutes: serviceBody.shape.durationMinutes,
      recurringDiscountPercent: z.number().min(0).max(50),
      fields: serviceFields,
      symptomsList: serviceBody.shape.symptomsList,
      sheetKind: serviceBody.shape.sheetKind,
      items: serviceBody.shape.items,
      isActive: z.boolean(),
      sortOrder: z.number().int(),
    })
    .partial(),
  deleteBookings: z.object({ ids: z.array(objectId).min(1).max(100) }),
  bookings: pageQuery.extend({
    status: z.string().optional(),
    queue: z.enum(['verification', 'unassigned', 'active', 'awaiting_acceptance']).optional(),
    assistantId: objectId.optional(),
    customerId: objectId.optional(),
    parentId: objectId.optional(),
    serviceId: objectId.optional(),
    city: z.string().max(80).optional(),
    recurring: z.enum(['true', 'false']).optional(),
    from: date.optional(),
    to: date.optional(),
    q: z.string().max(100).optional(),
    sort: z.enum(['scheduled', 'oldest', 'created']).optional(),
  }),
  verifyBooking: z.object({ notes: z.string().trim().max(1000).optional() }),
  assign: z.object({ assistantId: objectId, override: z.boolean().default(false), overrideReason: z.string().trim().min(5).max(500).optional() }),
  notes: z.object({ adminNotes: z.string().trim().max(2000) }),
  cancel: z.object({ reason: z.string().trim().min(3).max(500) }),
  reschedule: booking.reschedule,
  verification: z
    .object({ status: z.enum(Object.values(ASSISTANT_VERIFICATION).filter((s) => s !== 'PENDING')), notes: z.string().trim().max(1000).optional() })
    .refine((v) => v.status !== 'REJECTED' || (v.notes && v.notes.length >= 3), { message: 'Reason is required when rejecting', path: ['notes'] }),
  documentReview: z.object({ status: z.enum(['ACCEPTED', 'REJECTED']), notes: z.string().trim().max(500).optional() }),
  userStatus: z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason: z.string().trim().min(3).max(500) }),
  broadcast: z
    .object({
      audience: z.enum(['ALL_CUSTOMERS', 'ALL_ASSISTANTS', 'APPROVED_ASSISTANTS', 'USERS']),
      userIds: z.array(objectId).max(1000).optional(),
      emails: z.array(email).max(200).optional(),
      title: z.string().trim().min(3).max(80),
      body: z.string().trim().min(3).max(300),
      // What opens when the notification is tapped
      screen: z.enum(Object.keys(APP_SCREENS)).optional(),
      recordId: objectId.optional(),
      url: z.string().trim().max(500).regex(/^(https:\/\/|careeldersindia:\/\/)/, 'Link must start with https:// or careeldersindia://').optional(),
    })
    .refine((v) => v.audience !== 'USERS' || v.userIds?.length || v.emails?.length, { message: 'Choose at least one person', path: ['emails'] })
    .refine((v) => !v.screen || !APP_SCREENS[v.screen].param || v.recordId, { message: 'This screen needs a record id', path: ['recordId'] })
    .refine((v) => !(v.screen && v.url), { message: 'Choose a screen or a link, not both', path: ['url'] })
    .refine(
      (v) => !v.screen || v.audience === 'USERS' || APP_SCREENS[v.screen].roles.includes(v.audience === 'ALL_CUSTOMERS' ? 'CUSTOMER' : 'ASSISTANT'),
      { message: 'That screen does not exist in the app for this audience', path: ['screen'] }
    ),
  correctionReview: z.object({ approve: z.boolean(), note: z.string().trim().max(500).optional() }),
  correctionParams: z.object({ id: objectId, correctionId: objectId }),
  auditQuery: pageQuery.extend({ action: z.string().max(80).optional(), entityType: z.string().max(40).optional(), entityId: z.string().optional(), actorId: z.string().optional(), actorRole: z.string().optional(), from: z.string().optional(), to: z.string().optional() }),
};

const notification = {
  registerToken: z.object({ token: z.string().min(20).max(4096), platform: z.enum(['ios', 'android', 'web']), deviceId: z.string().max(200).optional(), appVersion: z.string().max(40).optional() }),
  unregisterToken: z.object({ token: z.string().min(20).max(4096) }),
  list: pageQuery.extend({ unread: z.enum(['true', 'false']).optional() }),
  markRead: z.object({ ids: z.array(objectId).max(200).optional(), all: z.boolean().optional() }),
};

const emergency = {
  sos: z.object({ bookingId: objectId.optional(), message: z.string().trim().max(1000).optional(), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional() }),
  resolve: z.object({ notes: z.string().trim().min(3).max(1000) }),
  list: pageQuery.extend({ status: z.enum(['ACTIVE', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional(), type: z.enum(['SOS', 'HEALTH_URGENT']).optional() }),
};

module.exports = { common: { objectId, idParam, pageQuery }, auth, parent, booking, recurring, payment, assistant, admin, notification, emergency, healthVisit };
