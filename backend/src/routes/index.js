const express = require('express');
const { z } = require('zod');
const { authenticate, requireRole } = require('../middleware/auth');
const { adminGuard } = require('../middleware/rbac');
const staff = require('../controllers/staff.controller');
const { validate } = require('../middleware/validate');
const { authLimiter, otpLimiter } = require('../middleware/rateLimit');
const { upload, verifyFileContent } = require('../middleware/upload');
const { ROLES } = require('../config/constants');
const v = require('../validators');
const auth = require('../controllers/auth.controller');
const customer = require('../controllers/customer.controller');
const payment = require('../controllers/payment.controller');
const assistant = require('../controllers/assistant.controller');
const common = require('../controllers/common.controller');
const admin = require('../controllers/admin.controller');
const trip = require('../controllers/trip.controller');
const adminUsers = require('../controllers/adminUsers.controller');
const vAU = require('../validators/adminUsers');
const sheet = require('../controllers/sheet.controller');
const settings = require('../controllers/settings.controller');
const { tripLimiter } = require('../middleware/rateLimit');

const { idParam, pageQuery, objectId } = v.common;
const { CUSTOMER: C, ASSISTANT: A, ADMIN: AD } = ROLES;
const id = validate({ params: idParam });
const withBody = (schema) => validate({ params: idParam, body: schema });

const router = express.Router();

// ---------------------------------------------------------------- auth
const authR = express.Router();
// Accounts are created by the admin. Set ALLOW_SELF_REGISTRATION=true to re-open public signup.
const selfRegister = (_req, res, next) => (process.env.ALLOW_SELF_REGISTRATION === 'true' ? next() : res.status(403).json({ success: false, message: 'Accounts are created by the care desk. Please contact support.', code: 'REGISTRATION_CLOSED' }));
authR.post('/register', selfRegister, authLimiter, validate({ body: v.auth.registerCustomer }), auth.registerCustomer);
authR.post('/register/assistant', selfRegister, authLimiter, validate({ body: v.auth.registerAssistant }), auth.registerAssistant);
authR.post('/login', authLimiter, validate({ body: v.auth.login }), auth.login);
authR.post('/refresh', validate({ body: v.auth.refresh }), auth.refresh);
authR.post('/logout', auth.logout);
authR.post('/forgot-password', otpLimiter, validate({ body: v.auth.forgot }), auth.forgotPassword);
authR.post('/reset-password', otpLimiter, validate({ body: v.auth.reset }), auth.resetPassword);
authR.post('/change-password', authenticate, validate({ body: v.auth.changePassword }), auth.changePassword);
authR.get('/me', authenticate, auth.me);
authR.patch('/me', authenticate, validate({ body: v.auth.updateMe }), auth.updateMe);
router.use('/auth', authR);

// ---------------------------------------------------------------- public
router.get('/contact', settings.getContact); // public contact details (edited in admin → Settings)
router.get('/services', customer.listServices);
router.get('/services/:id', id, customer.getService);
router.get('/media/file', common.mediaFile); // HMAC-signed, no bearer
router.get('/sheets/file', sheet.file); // HMAC-signed daily/monthly sheet download
router.post('/trip/locations', tripLimiter, trip.locations); // X-Trip-Token, background GPS

// ---------------------------------------------------------------- any signed-in role
router.use(authenticate);
router.get('/notifications', validate({ query: v.notification.list }), common.listNotifications);
router.post('/notifications/read', validate({ body: v.notification.markRead }), common.markRead);
router.post('/notifications/register-token', validate({ body: v.notification.registerToken }), common.registerToken);
router.post('/notifications/unregister-token', validate({ body: v.notification.unregisterToken }), common.unregisterToken);
router.get('/media/:id/url', id, common.mediaUrl);
router.get('/reports', validate({ query: pageQuery }), common.listReports);
router.get('/reports/:id', id, common.getReport);
router.get('/reports/:id/pdf', id, common.reportPdf);
router.post('/emergency/sos', requireRole(C, A), validate({ body: v.emergency.sos }), common.sos);
router.get('/emergency/mine', requireRole(C, A), common.myAlerts);
router.post('/health-visits/:visitId/corrections', requireRole(C, A), validate({ params: z.object({ visitId: objectId }), body: v.healthVisit.correction }), common.requestCorrection);

// ---------------------------------------------------------------- customer
const cust = express.Router();
cust.use(requireRole(C));
cust.get('/home', customer.home);
cust.get('/parents', customer.listParents);
cust.post('/parents', validate({ body: v.parent.create }), customer.createParent);
cust.get('/parents/:id', id, customer.getParent);
cust.post('/parents/:id/photo', upload.single('file'), verifyFileContent, validate({ params: idParam }), customer.parentPhoto);
cust.patch('/parents/:id', withBody(v.parent.update), customer.updateParent);
cust.delete('/parents/:id', id, customer.archiveParent);
cust.get('/parents/:id/sheet-link', validate({ params: idParam, query: vAU.sheetQuery }), sheet.customerLink);
cust.get('/parents/:id/health-history', validate({ params: idParam, query: v.parent.history }), customer.healthHistory);
cust.post('/parents/:id/family', withBody(v.parent.invite), customer.inviteFamily);
cust.patch('/parents/:id/family/:memberId', validate({ params: v.parent.memberParams, body: v.parent.updateMember }), customer.updateFamily);
cust.delete('/parents/:id/family/:memberId', validate({ params: v.parent.memberParams }), customer.revokeFamily);

cust.post('/bookings', validate({ body: v.booking.create }), customer.createBooking);
cust.get('/bookings', validate({ query: v.booking.list }), customer.listBookings);
cust.get('/bookings/:id', id, customer.getBooking);
cust.get('/bookings/:id/visit', id, common.bookingVisit);
cust.get('/bookings/:id/location', id, common.bookingLocation);
cust.post('/bookings/:id/cancel', withBody(v.booking.cancel), customer.cancelBooking);
cust.post('/bookings/:id/reschedule', withBody(v.booking.reschedule), customer.rescheduleBooking);

cust.get('/recurring-plans/preview', validate({ query: v.recurring.preview }), customer.previewPlan);
cust.post('/recurring-plans', validate({ body: v.recurring.create }), customer.createPlan);
cust.get('/recurring-plans', validate({ query: pageQuery }), customer.listPlans);
cust.get('/recurring-plans/:id', id, customer.getPlan);
cust.post('/recurring-plans/:id/pause', id, customer.pausePlan);
cust.post('/recurring-plans/:id/resume', id, customer.resumePlan);
cust.post('/recurring-plans/:id/renew', id, customer.renewPlan);
cust.post('/recurring-plans/:id/cancel', withBody(v.recurring.cancel), customer.cancelPlan);

cust.post('/payments/order', validate({ body: v.payment.createOrder }), payment.createOrder);
cust.post('/payments/verify', validate({ body: v.payment.verify }), payment.verify);
cust.get('/payments', validate({ query: pageQuery }), payment.list);
cust.get('/payments/:id', id, payment.get);
router.use('/customer', cust);

// ---------------------------------------------------------------- assistant
const asst = express.Router();
asst.use(requireRole(A));
asst.get('/home', assistant.home);
asst.get('/profile', assistant.profile);
asst.patch('/profile', validate({ body: v.assistant.updateProfile }), assistant.updateProfile);
asst.put('/availability', validate({ body: v.assistant.availability }), assistant.availability);
asst.post('/documents', upload.single('file'), verifyFileContent, validate({ body: v.assistant.document }), assistant.uploadDocument);
asst.get('/earnings', validate({ query: v.assistant.earnings }), assistant.earnings);
asst.post('/location', validate({ body: v.assistant.location }), assistant.location);
asst.post('/jobs/:id/trip-token', id, trip.issue);

asst.get('/jobs', validate({ query: v.assistant.jobs }), assistant.listJobs);
asst.get('/jobs/:id', id, assistant.getJob);
asst.post('/jobs/:id/accept', id, assistant.accept);
asst.post('/jobs/:id/reject', withBody(v.assistant.reject), assistant.reject);
asst.post('/jobs/accept-many', validate({ body: v.assistant.acceptMany }), assistant.acceptMany);
asst.post('/jobs/:id/start-travel', id, assistant.startTravel);
asst.post('/jobs/:id/reached', withBody(v.assistant.reached), assistant.reached);
asst.post('/jobs/:id/start-visit', id, assistant.startVisit);
asst.post('/jobs/:id/no-show', withBody(v.assistant.noShow), assistant.noShow);
asst.get('/jobs/:id/visit', id, assistant.getVisit);
asst.patch('/jobs/:id/visit', withBody(v.healthVisit.visitDraft), assistant.saveDraft);
asst.post('/jobs/:id/visit/media', upload.single('file'), verifyFileContent, validate({ params: idParam, body: v.assistant.visitMedia }), assistant.addMedia);
asst.delete('/jobs/:id/visit/media/:mediaId', validate({ params: z.object({ id: objectId, mediaId: objectId }) }), assistant.removeMedia);
asst.post('/jobs/:id/visit/complete', withBody(v.healthVisit.visitComplete), assistant.complete);
router.use('/assistant', asst);

// ---------------------------------------------------------------- admin
const adm = express.Router();
adm.use(requireRole(AD), adminGuard);
adm.get('/dashboard', admin.dashboard);
adm.get('/live-map', admin.liveMap);

adm.get('/bookings', validate({ query: v.admin.bookings }), admin.listBookings);
adm.get('/bookings/:id', id, admin.getBooking);
adm.post('/bookings/delete-many', validate({ body: v.admin.deleteBookings }), adminUsers.deleteBookings);
adm.delete('/bookings/:id', id, adminUsers.deleteBooking);
adm.post('/bookings/:id/verify', withBody(v.admin.verifyBooking), admin.verifyBooking);
adm.get('/bookings/:id/eligible-assistants', id, admin.eligibleAssistants);
adm.post('/bookings/:id/assign', withBody(v.admin.assign), admin.assign);
adm.post('/bookings/:id/cancel', withBody(v.admin.cancel), admin.cancelBooking);
adm.post('/bookings/:id/reschedule', withBody(v.admin.reschedule), admin.rescheduleBooking);
adm.patch('/bookings/:id/notes', withBody(v.admin.notes), admin.bookingNotes);
adm.get('/bookings/:id/trail', id, admin.bookingTrail);
adm.get('/bookings/:id/visit', id, admin.bookingVisit);

adm.get('/customers', validate({ query: pageQuery }), admin.listCustomers);
adm.get('/customers/:id', id, admin.getCustomer);
adm.get('/customers/:id/summary-pdf', id, admin.summaryPdf);
adm.get('/parents', validate({ query: pageQuery }), admin.listParents);
adm.get('/parents/:id', id, admin.getParent);
adm.post('/parents/:id/photo', upload.single('file'), verifyFileContent, validate({ params: idParam }), customer.parentPhoto);
adm.get('/parents/:id/sheet-link', validate({ params: idParam, query: vAU.sheetQuery }), sheet.adminLink);
adm.delete('/customers/:id', id, adminUsers.deleteCustomer);
adm.delete('/assistants/:id', id, adminUsers.deleteAssistant);
adm.patch('/parents/:id', withBody(v.parent.update), admin.updateParent);
adm.delete('/parents/:id', id, admin.archiveParent);
adm.get('/assistants/workload', validate({ query: vAU.workload }), admin.assistantWorkload);
adm.get('/assistants/:id/day-report', validate({ params: idParam, query: vAU.workload }), admin.assistantDayReport);
adm.patch('/assistants/:id', withBody(vAU.assistantUpdate), adminUsers.updateAssistant);
adm.post('/assistants/:id/documents', upload.single('file'), verifyFileContent, validate({ params: idParam, body: v.assistant.document.partial({ documentNumber: true }) }), adminUsers.addAssistantDocument);
adm.delete('/assistant-documents/:id', id, adminUsers.deleteAssistantDocument);
adm.get('/assistants', validate({ query: pageQuery }), admin.listAssistants);
adm.get('/assistants/:id', id, admin.getAssistant);
adm.post('/assistants/:id/verification', withBody(v.admin.verification), admin.setVerification);
adm.post('/assistant-documents/:id/review', withBody(v.admin.documentReview), admin.reviewDocument);
adm.patch('/users/:id/status', withBody(v.admin.userStatus), admin.setUserStatus);
// admin-managed accounts
adm.post('/customers', validate({ body: vAU.customer }), adminUsers.createCustomer);
adm.post('/customers/:id/parents', withBody(v.parent.create), adminUsers.createParent);
adm.post('/assistants', validate({ body: vAU.assistant }), adminUsers.createAssistant);
adm.patch('/users/:id/login', withBody(vAU.login), adminUsers.setLogin); // { enabled: true|false }
adm.post('/users/:id/reset-password', id, adminUsers.resetPassword);
adm.post('/plans', validate({ body: vAU.plan }), adminUsers.createPlan);

adm.get('/services', admin.listServices);
adm.post('/services', validate({ body: v.admin.service }), admin.createService);
adm.patch('/services/:id', withBody(v.admin.serviceUpdate), admin.updateService);
adm.delete('/services/:id', id, admin.deactivateService);

adm.get('/recurring-plans', validate({ query: pageQuery }), admin.listPlans);
adm.get('/recurring-plans/:id', id, admin.getPlan);
adm.patch('/recurring-plans/:id', withBody(vAU.planUpdate), admin.updatePlan);
adm.post('/recurring-plans/:id/renew', withBody(vAU.renew), admin.renewPlan);
adm.put('/recurring-plans/:id/payment', withBody(vAU.payment), admin.savePlanPayment);
adm.post('/recurring-plans/:id/pause', id, admin.pausePlan);
adm.post('/recurring-plans/:id/resume', id, admin.resumePlan);
adm.post('/recurring-plans/:id/cancel', withBody(v.recurring.cancel), admin.cancelPlan);
adm.post('/recurring-plans/:id/generate', id, admin.generatePlan);
adm.delete('/recurring-plans/:id', id, admin.deletePlan);

adm.get('/payments', validate({ query: pageQuery }), admin.listPayments);
adm.get('/payments/:id', id, admin.getPayment);
adm.patch('/payments/:id', withBody(vAU.payment), admin.updatePayment);
adm.post('/payments/:id/refund', withBody(v.payment.refund), admin.refund);

adm.get('/reports', validate({ query: pageQuery }), admin.listReports);
adm.get('/reports/:id', id, admin.getReport);
adm.get('/reports/:id/pdf', id, admin.reportPdf);
adm.post('/reports/:id/regenerate-pdf', id, admin.regeneratePdf);

adm.get('/corrections', admin.pendingCorrections);
adm.post('/health-visits/:id/corrections/:correctionId/review', validate({ params: v.admin.correctionParams, body: v.admin.correctionReview }), admin.reviewCorrection);
adm.post('/health-visits/:id/correct', withBody(v.healthVisit.correction), admin.correctVisit);

adm.get('/emergency-alerts', validate({ query: v.emergency.list }), admin.listAlerts);
adm.post('/emergency-alerts/:id/acknowledge', id, admin.acknowledgeAlert);
adm.post('/emergency-alerts/:id/resolve', withBody(v.emergency.resolve), admin.resolveAlert);

adm.get('/audit-logs', validate({ query: v.admin.auditQuery }), admin.auditLogs);
adm.post('/notifications/broadcast', validate({ body: v.admin.broadcast }), admin.broadcast);
adm.get('/notifications/broadcasts', admin.recentBroadcasts);
adm.get('/notifications/screens', admin.appScreens);

adm.get('/permissions', staff.catalogue);
adm.get('/roles', staff.listRoles);
adm.post('/roles', validate({ body: staff.schemas.role }), staff.createRole);
adm.patch('/roles/:id', withBody(staff.schemas.rolePatch), staff.updateRole);
adm.delete('/roles/:id', id, staff.deleteRole);
adm.get('/staff', staff.listStaff);
adm.post('/staff', validate({ body: staff.schemas.staff }), staff.createStaff);
adm.patch('/staff/:id', withBody(staff.schemas.staffPatch), staff.updateStaff);
adm.get('/settings/contact', settings.getContact);
adm.put('/settings/contact', validate({ body: settings.contactSchema }), settings.updateContact);
router.use('/admin', adm);

module.exports = { router, webhookHandler: payment.webhook, wellKnown: trip };
