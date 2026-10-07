const { asyncHandler } = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const adminService = require('../services/admin.service');
const assignment = require('../services/assignment.service');
const bookingService = require('../services/booking.service');
const assistantService = require('../services/assistant.service');
const catalog = require('../services/catalog.service');
const recurringService = require('../services/recurring.service');
const paymentService = require('../services/payment.service');
const reportService = require('../services/report.service');
const visitService = require('../services/healthVisit.service');
const locationService = require('../services/location.service');
const emergency = require('../services/emergency.service');

const paged = (fn) => asyncHandler(async (req, res) => {
  const { items, meta } = await fn(req);
  return ok(res, items, 'OK', 200, meta);
});

module.exports = {
  dashboard: asyncHandler(async (_req, res) => ok(res, await adminService.dashboard())),
  liveMap: asyncHandler(async (_req, res) => ok(res, await locationService.activeForAdmin())),

  listBookings: paged((req) => adminService.listBookings(req.query)),
  getBooking: asyncHandler(async (req, res) => ok(res, await adminService.getBooking(req.params.id))),
  verifyBooking: asyncHandler(async (req, res) => ok(res, await assignment.verifyBooking(req.user, req.params.id, req.body, req), 'Booking verified')),
  eligibleAssistants: asyncHandler(async (req, res) => ok(res, await assignment.eligibleAssistants(req.params.id))),
  assign: asyncHandler(async (req, res) => ok(res, await assignment.assign(req.user, req.params.id, req.body, req), 'Assistant assigned')),
  cancelBooking: asyncHandler(async (req, res) => ok(res, await bookingService.cancel(req.user, req.params.id, req.body, req), 'Booking cancelled')),
  rescheduleBooking: asyncHandler(async (req, res) => ok(res, await bookingService.reschedule(req.user, req.params.id, req.body, req), 'Booking rescheduled')),
  bookingNotes: asyncHandler(async (req, res) => ok(res, await adminService.updateBookingNotes(req.user, req.params.id, req.body, req), 'Notes saved')),
  bookingTrail: asyncHandler(async (req, res) => ok(res, await locationService.trail(req.params.id))),
  bookingVisit: asyncHandler(async (req, res) => ok(res, await visitService.getVisit(req.user, req.params.id))),

  listCustomers: paged((req) => adminService.listCustomers(req.query)),
  getCustomer: asyncHandler(async (req, res) => ok(res, await adminService.getCustomer(req.params.id))),
  listParents: paged((req) => adminService.listParents(req.query)),
  getParent: asyncHandler(async (req, res) => ok(res, await adminService.getParent(req.params.id))),
  listAssistants: paged((req) => adminService.listAssistants(req.query)),
  getAssistant: asyncHandler(async (req, res) => ok(res, await adminService.getAssistant(req.params.id))),
  setVerification: asyncHandler(async (req, res) => ok(res, await assistantService.setVerification(req.user, req.params.id, req.body.status, req.body.notes, req), 'Verification updated')),
  reviewDocument: asyncHandler(async (req, res) => ok(res, await adminService.reviewDocument(req.user, req.params.id, req.body, req), 'Document reviewed')),
  setUserStatus: asyncHandler(async (req, res) => ok(res, await adminService.setUserStatus(req.user, req.params.id, req.body, req), 'User updated')),

  listServices: asyncHandler(async (_req, res) => ok(res, await adminService.servicesWithUsage())),
  createService: asyncHandler(async (req, res) => created(res, await catalog.create(req.user, req.body, req), 'Service created')),
  updateService: asyncHandler(async (req, res) => ok(res, await catalog.update(req.user, req.params.id, req.body, req), 'Service updated')),
  deactivateService: asyncHandler(async (req, res) => ok(res, await catalog.deactivate(req.user, req.params.id, req), 'Service deactivated')),

  updateParent: asyncHandler(async (req, res) => ok(res, await require('../services/parent.service').update(req.user, req.params.id, req.body, req), 'Parent updated')),
  archiveParent: asyncHandler(async (req, res) => ok(res, await require('../services/parent.service').archive(req.user, req.params.id, req) || {}, 'Parent removed')),
  updatePlan: asyncHandler(async (req, res) => ok(res, await recurringService.adminUpdatePlan(req.user, req.params.id, req.body, req), 'Plan updated')),
  renewPlan: asyncHandler(async (req, res) => created(res, await recurringService.renewPlan(req.user, req.params.id, req.body, req), 'Plan renewed')),
  savePlanPayment: asyncHandler(async (req, res) => ok(res, await paymentService.adminSavePlanPayment(req.user, req.params.id, req.body, req), 'Payment saved')),
  updatePayment: asyncHandler(async (req, res) => ok(res, await paymentService.adminUpdatePayment(req.user, req.params.id, req.body, req), 'Payment updated')),
  assistantWorkload: paged((req) => adminService.assistantWorkload(req.query)),
  assistantDayReport: asyncHandler(async (req, res) => ok(res, await adminService.assistantDayReport(req.params.id, req.query))),
  listPlans: paged((req) => recurringService.list(req.user, req.query)),
  getPlan: asyncHandler(async (req, res) => ok(res, await recurringService.get(req.user, req.params.id))),
  pausePlan: asyncHandler(async (req, res) => ok(res, await recurringService.setPaused(req.user, req.params.id, true, req), 'Plan paused')),
  resumePlan: asyncHandler(async (req, res) => ok(res, await recurringService.setPaused(req.user, req.params.id, false, req), 'Plan resumed')),
  cancelPlan: asyncHandler(async (req, res) => ok(res, await recurringService.cancelPlan(req.user, req.params.id, req.body, req), 'Plan cancelled')),
  deletePlan: asyncHandler(async (req, res) => ok(res, await adminService.deletePlan(req.user, req.params.id, req), 'Plan deleted')),
  generatePlan: asyncHandler(async (req, res) => {
    const { plan } = await recurringService.get(req.user, req.params.id);
    return ok(res, { generated: await recurringService.generateForPlan(plan) }, 'Generation run');
  }),

  listPayments: paged((req) => paymentService.listForUser(req.user, req.query)),
  getPayment: asyncHandler(async (req, res) => ok(res, await paymentService.getForUser(req.user, req.params.id))),
  refund: asyncHandler(async (req, res) => created(res, await paymentService.refundPayment(req.params.id, { ...req.body, actor: req.user }), 'Refund initiated')),

  listReports: paged((req) => adminService.listReports(req.query)),
  getReport: asyncHandler(async (req, res) => ok(res, await reportService.getForUser(req.user, req.params.id))),
  reportPdf: asyncHandler(async (req, res) => ok(res, await reportService.pdfUrl(req.user, req.params.id))),
  regeneratePdf: asyncHandler(async (req, res) => ok(res, { pdf: (await reportService.generatePdf(req.params.id))?.pdf }, 'PDF regenerated')),

  pendingCorrections: asyncHandler(async (_req, res) => ok(res, await visitService.pendingCorrections())),
  reviewCorrection: asyncHandler(async (req, res) => ok(res, await visitService.reviewCorrection(req.user, req.params.id, req.params.correctionId, req.body, req))),
  correctVisit: asyncHandler(async (req, res) => ok(res, await visitService.adminCorrect(req.user, req.params.id, req.body, req), 'Correction applied')),

  listAlerts: paged((req) => emergency.list(req.query)),
  acknowledgeAlert: asyncHandler(async (req, res) => ok(res, await emergency.acknowledge(req.user, req.params.id, req), 'Acknowledged')),
  resolveAlert: asyncHandler(async (req, res) => ok(res, await emergency.resolve(req.user, req.params.id, req.body, req), 'Resolved')),

  auditLogs: paged((req) => adminService.listAuditLogs(req.query)),
  broadcast: asyncHandler(async (req, res) => created(res, await adminService.broadcast(req.user, req.body, req), 'Notification sent')),
  recentBroadcasts: asyncHandler(async (_req, res) => ok(res, await adminService.recentBroadcasts())),
  appScreens: (_req, res) => ok(res, adminService.appScreens()),
};
