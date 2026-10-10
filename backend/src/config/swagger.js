/**
 * Programmatic OpenAPI 3 document. Endpoints listed compactly; request bodies documented by name
 * (the zod schemas in src/validators are the source of truth for field rules).
 */
const { env } = require('./env');
const { BOOKING_STATUS } = require('./constants');

const E = (method, path, tag, summary, opts = {}) => ({ method, path, tag, summary, ...opts });

const endpoints = [
  E('post', '/auth/register', 'Auth', 'Register customer', { auth: false, body: 'RegisterCustomer' }),
  E('post', '/auth/register/assistant', 'Auth', 'Register assistant (pending verification)', { auth: false, body: 'RegisterAssistant' }),
  E('post', '/auth/login', 'Auth', 'Login (portal ADMIN sets refresh cookie; MOBILE returns refreshToken)', { auth: false, body: 'Login' }),
  E('post', '/auth/refresh', 'Auth', 'Rotate refresh token (body or cookie)', { auth: false }),
  E('post', '/auth/logout', 'Auth', 'Revoke refresh token family', { auth: false }),
  E('post', '/auth/forgot-password', 'Auth', 'Request OTP (generic response)', { auth: false }),
  E('post', '/auth/reset-password', 'Auth', 'Reset password with OTP', { auth: false }),
  E('post', '/auth/change-password', 'Auth', 'Change password (revokes other sessions)'),
  E('get', '/auth/me', 'Auth', 'Current user'),
  E('patch', '/auth/me', 'Auth', 'Update own profile'),

  E('get', '/services', 'Catalog', 'Active services', { auth: false }),
  E('get', '/services/{id}', 'Catalog', 'Service detail', { auth: false }),

  E('get', '/customer/home', 'Customer', 'Home summary'),
  E('get', '/customer/parents', 'Parents', 'Parents I can access'),
  E('post', '/customer/parents', 'Parents', 'Add parent', { body: 'Parent' }),
  E('get', '/customer/parents/{id}', 'Parents', 'Parent detail'),
  E('patch', '/customer/parents/{id}', 'Parents', 'Update parent (MANAGE)'),
  E('delete', '/customer/parents/{id}', 'Parents', 'Archive parent (owner)'),
  E('get', '/customer/parents/{id}/health-history', 'Parents', 'Reports + measurement series'),
  E('post', '/customer/parents/{id}/family', 'Family', 'Invite family member'),
  E('patch', '/customer/parents/{id}/family/{memberId}', 'Family', 'Change permissions'),
  E('delete', '/customer/parents/{id}/family/{memberId}', 'Family', 'Revoke access'),

  E('post', '/customer/bookings', 'Bookings', 'Create one-time booking (PENDING_PAYMENT)', { body: 'CreateBooking' }),
  E('get', '/customer/bookings', 'Bookings', 'List (scope=upcoming|past)'),
  E('get', '/customer/bookings/{id}', 'Bookings', 'Booking detail'),
  E('get', '/customer/bookings/{id}/visit', 'Bookings', 'Visit summary (after completion)'),
  E('get', '/customer/bookings/{id}/location', 'Tracking', 'Latest assistant location (ON_THE_WAY/REACHED only)'),
  E('post', '/customer/bookings/{id}/cancel', 'Bookings', 'Cancel (auto refund ≥12h ahead)'),
  E('post', '/customer/bookings/{id}/reschedule', 'Bookings', 'Reschedule (returns to verification)'),

  E('get', '/customer/recurring-plans/preview', 'Recurring', 'Preview dates'),
  E('post', '/customer/recurring-plans', 'Recurring', 'Create plan (PENDING_PAYMENT)'),
  E('get', '/customer/recurring-plans', 'Recurring', 'List plans'),
  E('get', '/customer/recurring-plans/{id}', 'Recurring', 'Plan + generated bookings'),
  E('post', '/customer/recurring-plans/{id}/pause', 'Recurring', 'Pause'),
  E('post', '/customer/recurring-plans/{id}/resume', 'Recurring', 'Resume'),
  E('post', '/customer/recurring-plans/{id}/cancel', 'Recurring', 'Cancel (prorated refund)'),

  E('post', '/customer/payments/order', 'Payments', 'Create Razorpay order'),
  E('post', '/customer/payments/verify', 'Payments', 'Client-side verify (webhook stays authoritative)'),
  E('get', '/customer/payments', 'Payments', 'My payments'),
  E('get', '/customer/payments/{id}', 'Payments', 'Payment + refunds'),
  E('post', '/payments/webhook', 'Payments', 'Razorpay webhook (raw body, X-Razorpay-Signature)', { auth: false }),

  E('get', '/assistant/home', 'Assistant', 'Today summary'),
  E('get', '/assistant/profile', 'Assistant', 'Profile + documents'),
  E('patch', '/assistant/profile', 'Assistant', 'Update profile / bank / PAN'),
  E('put', '/assistant/availability', 'Assistant', 'Availability + working hours'),
  E('post', '/assistant/documents', 'Assistant', 'Upload KYC document (multipart: file,type,documentNumber)', { multipart: true }),
  E('get', '/assistant/earnings', 'Assistant', 'Completed visits by month'),
  E('post', '/assistant/location', 'Tracking', 'REST fallback for location:update'),
  E('get', '/assistant/jobs', 'Jobs', 'List (scope=today|upcoming|history|new)'),
  E('get', '/assistant/jobs/{id}', 'Jobs', 'Job detail (least privilege)'),
  E('post', '/assistant/jobs/{id}/accept', 'Jobs', 'Accept'),
  E('post', '/assistant/jobs/{id}/reject', 'Jobs', 'Reject with reason'),
  E('post', '/assistant/jobs/{id}/start-travel', 'Jobs', 'ON_THE_WAY (≤3h before)'),
  E('post', '/assistant/jobs/{id}/reached', 'Jobs', 'REACHED (flags >500 m)'),
  E('post', '/assistant/jobs/{id}/start-visit', 'Jobs', 'VISIT_STARTED (creates HealthVisit)'),
  E('post', '/assistant/jobs/{id}/no-show', 'Jobs', 'NO_SHOW'),
  E('get', '/assistant/jobs/{id}/visit', 'Visit', 'Visit draft + form config'),
  E('patch', '/assistant/jobs/{id}/visit', 'Visit', 'Autosave draft', { body: 'VisitDraft' }),
  E('post', '/assistant/jobs/{id}/visit/media', 'Visit', 'Upload photo (multipart: file,type,caption)', { multipart: true }),
  E('delete', '/assistant/jobs/{id}/visit/media/{mediaId}', 'Visit', 'Remove photo'),
  E('post', '/assistant/jobs/{id}/visit/complete', 'Visit', 'Complete visit (Idempotency-Key header) → report', { body: 'VisitComplete', idempotent: true }),
  E('post', '/health-visits/{visitId}/corrections', 'Visit', 'Request correction (assistant/customer)'),

  E('get', '/reports', 'Reports', 'Reports I can access'),
  E('get', '/reports/{id}', 'Reports', 'Report detail + versions'),
  E('get', '/reports/{id}/pdf', 'Reports', 'Signed PDF URL'),
  E('get', '/media/{id}/url', 'Media', 'Signed URL for a file'),
  E('get', '/media/file', 'Media', 'Serve local file (key, exp, sig)', { auth: false }),
  E('get', '/notifications', 'Notifications', 'Inbox (unread=true)'),
  E('post', '/notifications/read', 'Notifications', 'Mark read (ids or all)'),
  E('post', '/notifications/register-token', 'Notifications', 'Register FCM token'),
  E('post', '/notifications/unregister-token', 'Notifications', 'Remove FCM token'),
  E('post', '/emergency/sos', 'Emergency', 'Raise SOS'),
  E('get', '/emergency/mine', 'Emergency', 'My alerts'),

  E('get', '/admin/dashboard', 'Admin', 'Dashboard cards, trend, upcoming, alerts'),
  E('get', '/admin/live-map', 'Admin', 'Active trackable visits with latest location'),
  E('get', '/admin/bookings', 'Admin · Bookings', 'Search/filter (queue=verification|unassigned|active|awaiting_acceptance)'),
  E('get', '/admin/bookings/{id}', 'Admin · Bookings', 'Full detail: visit, reports, payment, audit, live location'),
  E('post', '/admin/bookings/{id}/verify', 'Admin · Bookings', 'Verify'),
  E('get', '/admin/bookings/{id}/eligible-assistants', 'Admin · Bookings', 'Eligibility with reasons'),
  E('post', '/admin/bookings/{id}/assign', 'Admin · Bookings', 'Assign / reassign (override with reason)'),
  E('post', '/admin/bookings/{id}/cancel', 'Admin · Bookings', 'Cancel (full refund)'),
  E('post', '/admin/bookings/{id}/reschedule', 'Admin · Bookings', 'Reschedule'),
  E('patch', '/admin/bookings/{id}/notes', 'Admin · Bookings', 'Admin notes'),
  E('get', '/admin/bookings/{id}/trail', 'Admin · Bookings', 'Location trail'),
  E('get', '/admin/bookings/{id}/visit', 'Admin · Bookings', 'Visit record'),
  E('get', '/admin/customers', 'Admin · People', 'Customers'),
  E('get', '/admin/customers/{id}', 'Admin · People', 'Customer detail'),
  E('get', '/admin/parents', 'Admin · People', 'Parents'),
  E('get', '/admin/parents/{id}', 'Admin · People', 'Parent detail + measurements'),
  E('get', '/admin/assistants', 'Admin · People', 'Assistants'),
  E('get', '/admin/assistants/{id}', 'Admin · People', 'Assistant detail + KYC'),
  E('post', '/admin/assistants/{id}/verification', 'Admin · People', 'Change verification status'),
  E('post', '/admin/assistant-documents/{id}/review', 'Admin · People', 'Accept/reject a document'),
  E('patch', '/admin/users/{id}/status', 'Admin · People', 'Suspend / reactivate'),
  E('get', '/admin/services', 'Admin · Catalog', 'All services + usage'),
  E('post', '/admin/services', 'Admin · Catalog', 'Create service'),
  E('patch', '/admin/services/{id}', 'Admin · Catalog', 'Update service'),
  E('delete', '/admin/services/{id}', 'Admin · Catalog', 'Deactivate service'),
  E('get', '/admin/recurring-plans', 'Admin · Plans', 'Plans'),
  E('get', '/admin/recurring-plans/{id}', 'Admin · Plans', 'Plan detail'),
  E('post', '/admin/recurring-plans/{id}/pause', 'Admin · Plans', 'Pause'),
  E('post', '/admin/recurring-plans/{id}/resume', 'Admin · Plans', 'Resume'),
  E('post', '/admin/recurring-plans/{id}/cancel', 'Admin · Plans', 'Cancel'),
  E('post', '/admin/recurring-plans/{id}/generate', 'Admin · Plans', 'Run generation now'),
  E('get', '/admin/payments', 'Admin · Payments', 'Payments'),
  E('get', '/admin/payments/{id}', 'Admin · Payments', 'Payment + refunds + gateway events'),
  E('post', '/admin/payments/{id}/refund', 'Admin · Payments', 'Refund (full/partial)'),
  E('get', '/admin/reports', 'Admin · Reports', 'Reports'),
  E('get', '/admin/reports/{id}', 'Admin · Reports', 'Report'),
  E('get', '/admin/reports/{id}/pdf', 'Admin · Reports', 'PDF URL'),
  E('post', '/admin/reports/{id}/regenerate-pdf', 'Admin · Reports', 'Regenerate PDF'),
  E('get', '/admin/corrections', 'Admin · Reports', 'Pending correction requests'),
  E('post', '/admin/health-visits/{id}/corrections/{correctionId}/review', 'Admin · Reports', 'Approve/reject correction (new report version)'),
  E('post', '/admin/health-visits/{id}/correct', 'Admin · Reports', 'Direct correction'),
  E('get', '/admin/emergency-alerts', 'Admin · Emergency', 'Alerts'),
  E('post', '/admin/emergency-alerts/{id}/acknowledge', 'Admin · Emergency', 'Acknowledge'),
  E('post', '/admin/emergency-alerts/{id}/resolve', 'Admin · Emergency', 'Resolve'),
  E('get', '/admin/audit-logs', 'Admin · Audit', 'Audit trail'),
  E('post', '/admin/notifications/broadcast', 'Admin · Notifications', 'Broadcast notification'),
  E('get', '/admin/notifications/broadcasts', 'Admin · Notifications', 'Recent broadcasts'),
];

const envelope = { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' }, data: {}, meta: { type: 'object' } } };
const errorBody = { type: 'object', properties: { success: { type: 'boolean', example: false }, message: { type: 'string' }, code: { type: 'string' }, details: { type: 'array', items: { type: 'object' } } } };

const schemas = {
  Envelope: envelope,
  Error: errorBody,
  RegisterCustomer: { type: 'object', required: ['name', 'email', 'password'], properties: { name: { type: 'string' }, email: { type: 'string' }, mobile: { type: 'string', example: '+14155550123' }, password: { type: 'string' }, country: { type: 'string', example: 'US' }, timezone: { type: 'string', example: 'America/New_York' } } },
  RegisterAssistant: { type: 'object', required: ['name', 'email', 'mobile', 'password', 'gender', 'dateOfBirth', 'address'], properties: { name: { type: 'string' }, email: { type: 'string' }, mobile: { type: 'string' }, password: { type: 'string' }, gender: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER'] }, dateOfBirth: { type: 'string', format: 'date' }, address: { type: 'object' }, serviceAreas: { type: 'array', items: { type: 'object' } } } },
  Login: { type: 'object', required: ['identifier', 'password'], properties: { identifier: { type: 'string', example: 'admin@careeldersindia.com' }, password: { type: 'string', example: 'Admin@12345' }, portal: { type: 'string', enum: ['ADMIN', 'MOBILE'] } } },
  Parent: { type: 'object', required: ['fullName', 'gender', 'dateOfBirth', 'address', 'emergencyContacts'], properties: { fullName: { type: 'string' }, gender: { type: 'string' }, dateOfBirth: { type: 'string', format: 'date' }, address: { type: 'object' }, latitude: { type: 'number' }, longitude: { type: 'number' }, medicines: { type: 'array', items: { type: 'object' } }, emergencyContacts: { type: 'array', items: { type: 'object' } } } },
  CreateBooking: { type: 'object', required: ['parentId', 'serviceId', 'date', 'time'], properties: { parentId: { type: 'string' }, serviceId: { type: 'string' }, date: { type: 'string', example: '2026-10-02' }, time: { type: 'string', example: '10:30', description: 'IST wall-clock time' }, customerNotes: { type: 'string' } } },
  VisitDraft: { type: 'object', properties: { measurements: { type: 'object', example: { bp: { systolic: 128, diastolic: 82 }, pulse: 76, spo2: 97, temperature: { value: 98.4, unit: 'F' } } }, symptoms: { type: 'array', items: { type: 'string' } }, medicationStatus: { type: 'array', items: { type: 'object' } }, notes: { type: 'string' }, overallStatus: { type: 'string', enum: ['STABLE', 'NEEDS_ATTENTION', 'URGENT_ATTENTION'] } } },
  VisitComplete: { allOf: [{ $ref: '#/components/schemas/VisitDraft' }, { type: 'object', required: ['confirm', 'overallStatus'], properties: { confirm: { type: 'boolean', enum: [true] }, urgent: { type: 'object' } } }] },
  BookingStatus: { type: 'string', enum: Object.values(BOOKING_STATUS) },
};

function buildSpec() {
  const paths = {};
  for (const e of endpoints) {
    const params = [...e.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
    if (e.idempotent) params.push({ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } });
    const op = {
      tags: [e.tag],
      summary: e.summary,
      parameters: params,
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Envelope' } } } },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        401: { description: 'Unauthenticated' },
        403: { description: 'Forbidden' },
        404: { description: 'Not found' },
        409: { description: 'Conflict (state machine / concurrency)' },
      },
    };
    if (e.auth === false) op.security = [];
    if (e.body) op.requestBody = { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${e.body}` } } } };
    else if (e.multipart) op.requestBody = { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, type: { type: 'string' } } } } } };
    else if (['post', 'patch', 'put'].includes(e.method)) op.requestBody = { required: false, content: { 'application/json': { schema: { type: 'object' } } } };
    paths[e.path] = paths[e.path] || {};
    paths[e.path][e.method] = op;
  }
  return {
    openapi: '3.0.3',
    info: {
      title: 'Care Elders India API',
      version: '1.0.0',
      description:
        'Senior health visit platform. All times are stored in UTC; visits are scheduled in India time (Asia/Kolkata). Money is in paise (INR). Health data are recorded measurements/observations — not a diagnosis.\n\nSocket.IO: connect with `auth: { token }`. Rooms: customer:{userId}, assistant:{userId}, booking:{id}, admin. Client events: booking:subscribe, booking:unsubscribe, location:update.',
    },
    servers: [{ url: `${env.API_PUBLIC_URL}/api/v1` }],
    security: [{ bearerAuth: [] }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }, schemas },
    paths,
  };
}

module.exports = { buildSpec, endpoints };
