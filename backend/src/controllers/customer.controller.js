const { asyncHandler } = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const parentService = require('../services/parent.service');
const bookingService = require('../services/booking.service');
const recurringService = require('../services/recurring.service');
const catalog = require('../services/catalog.service');
const { localToUtc } = require('../utils/time');

const paged = (fn) => asyncHandler(async (req, res) => {
  const { items, meta } = await fn(req);
  return ok(res, items, 'OK', 200, meta);
});

module.exports = {
  home: asyncHandler(async (req, res) => ok(res, { ...(await bookingService.customerHome(req.user)), expiringPlans: await recurringService.expiringForCustomer(req.user.id) })),

  listParents: asyncHandler(async (req, res) => ok(res, await parentService.listForUser(req.user))),
  createParent: asyncHandler(async (req, res) => created(res, await parentService.create(req.user, req.body, req), 'Parent added')),
  getParent: asyncHandler(async (req, res) => ok(res, await parentService.getDetails(req.user, req.params.id))),
  updateParent: asyncHandler(async (req, res) => ok(res, await parentService.update(req.user, req.params.id, req.body, req), 'Parent updated')),
  archiveParent: asyncHandler(async (req, res) => {
    await parentService.archive(req.user, req.params.id, req);
    return ok(res, {}, 'Parent removed');
  }),
  healthHistory: asyncHandler(async (req, res) => ok(res, await parentService.healthHistory(req.user, req.params.id, req.query))),
  inviteFamily: asyncHandler(async (req, res) => created(res, await parentService.inviteFamily(req.user, req.params.id, req.body, req), 'Family member invited')),
  updateFamily: asyncHandler(async (req, res) => ok(res, await parentService.updateFamilyMember(req.user, req.params.id, req.params.memberId, req.body, req), 'Permissions updated')),
  revokeFamily: asyncHandler(async (req, res) => {
    await parentService.revokeFamilyMember(req.user, req.params.id, req.params.memberId, req);
    return ok(res, {}, 'Access removed');
  }),

  listServices: asyncHandler(async (_req, res) => ok(res, await catalog.listActive())),
  getService: asyncHandler(async (req, res) => ok(res, await catalog.getById(req.params.id))),

  createBooking: asyncHandler(async (req, res) => created(res, await bookingService.createOneTime(req.user, req.body, req), 'Booking created — complete payment to confirm')),
  listBookings: paged((req) => bookingService.listForCustomer(req.user, req.query)),
  getBooking: asyncHandler(async (req, res) => ok(res, await bookingService.getForUser(req.user, req.params.id))),
  cancelBooking: asyncHandler(async (req, res) => ok(res, await bookingService.cancel(req.user, req.params.id, req.body, req), 'Visit cancelled')),
  rescheduleBooking: asyncHandler(async (req, res) => ok(res, await bookingService.reschedule(req.user, req.params.id, req.body, req), 'Visit rescheduled')),

  previewPlan: asyncHandler(async (req, res) => {
    const q = req.query;
    localToUtc(q.startDate, q.time); // throws on invalid date/time
    const plan = { frequency: q.frequency, intervalDays: q.intervalDays, startDate: q.startDate, timeOfDay: q.time, timezone: 'Asia/Kolkata', totalVisits: q.totalVisits };
    return ok(res, { dates: recurringService.previewSchedule(plan, q.totalVisits) });
  }),
  createPlan: asyncHandler(async (req, res) => created(res, await recurringService.createPlan(req.user, req.body, req), 'Plan created — complete payment to activate')),
  renewPlan: asyncHandler(async (req, res) => { const r = await recurringService.renewPlan(req.user, req.params.id, {}, req); return created(res, r, r.existing ? 'Renewal is waiting for payment' : 'Renewal created — complete payment to continue'); }),
  listPlans: paged((req) => recurringService.list(req.user, req.query)),
  getPlan: asyncHandler(async (req, res) => ok(res, await recurringService.get(req.user, req.params.id))),
  pausePlan: asyncHandler(async (req, res) => ok(res, await recurringService.setPaused(req.user, req.params.id, true, req), 'Plan paused')),
  resumePlan: asyncHandler(async (req, res) => ok(res, await recurringService.setPaused(req.user, req.params.id, false, req), 'Plan resumed')),
  cancelPlan: asyncHandler(async (req, res) => ok(res, await recurringService.cancelPlan(req.user, req.params.id, req.body, req), 'Plan cancelled')),
};
