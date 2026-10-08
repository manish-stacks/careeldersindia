const { asyncHandler } = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const assistantService = require('../services/assistant.service');
const jobService = require('../services/assistantJob.service');
const visitService = require('../services/healthVisit.service');
const locationService = require('../services/location.service');

module.exports = {
  home: asyncHandler(async (req, res) => ok(res, await assistantService.home(req.user.id))),
  profile: asyncHandler(async (req, res) => ok(res, await assistantService.getProfile(req.user.id))),
  updateProfile: asyncHandler(async (req, res) => ok(res, await assistantService.updateProfile(req.user.id, req.body), 'Profile updated')),
  availability: asyncHandler(async (req, res) => ok(res, await assistantService.setAvailability(req.user.id, req.body), 'Availability updated')),
  uploadDocument: asyncHandler(async (req, res) => created(res, await assistantService.uploadDocument(req.user, req.file, req.body), 'Document uploaded')),
  earnings: asyncHandler(async (req, res) => ok(res, await assistantService.earnings(req.user.id, req.query))),

  listJobs: asyncHandler(async (req, res) => {
    const { items, meta } = await assistantService.listJobs(req.user.id, req.query);
    return ok(res, items, 'OK', 200, meta);
  }),
  getJob: asyncHandler(async (req, res) => ok(res, await jobService.getJob(req.user, req.params.id))),
  accept: asyncHandler(async (req, res) => ok(res, await jobService.accept(req.user, req.params.id, req), 'Job accepted')),
  reject: asyncHandler(async (req, res) => ok(res, await jobService.reject(req.user, req.params.id, req.body, req), 'Job rejected')),
  acceptMany: asyncHandler(async (req, res) => {
    const results = [];
    for (const id of req.body.ids) {
      try { await jobService.accept(req.user, id, req); results.push({ id, ok: true }); } catch (e) { results.push({ id, ok: false, message: e.message }); }
    }
    ok(res, { results, accepted: results.filter((r) => r.ok).length }, 'Done');
  }),
  startTravel: asyncHandler(async (req, res) => ok(res, await jobService.startTravel(req.user, req.params.id, req), 'Travel started')),
  reached: asyncHandler(async (req, res) => ok(res, await jobService.markReached(req.user, req.params.id, req.body, req), 'Marked as reached')),
  startVisit: asyncHandler(async (req, res) => ok(res, await jobService.startVisit(req.user, req.params.id, req), 'Visit started')),
  noShow: asyncHandler(async (req, res) => ok(res, await jobService.markNoShow(req.user, req.params.id, req.body, req), 'Marked as no-show')),

  getVisit: asyncHandler(async (req, res) => ok(res, await visitService.getVisit(req.user, req.params.id))),
  saveDraft: asyncHandler(async (req, res) => ok(res, await visitService.saveDraft(req.user, req.params.id, req.body), 'Draft saved')),
  addMedia: asyncHandler(async (req, res) => created(res, await visitService.addMedia(req.user, req.params.id, req.file, req.body, req), 'Photo uploaded')),
  removeMedia: asyncHandler(async (req, res) => ok(res, await visitService.removeMedia(req.user, req.params.id, req.params.mediaId, req), 'Photo removed')),
  complete: asyncHandler(async (req, res) => {
    const key = req.headers['idempotency-key'];
    const result = await visitService.complete(req.user, req.params.id, req.body, typeof key === 'string' ? key.slice(0, 100) : undefined, req);
    return ok(res, result, result.replayed ? 'Visit already completed' : 'Visit completed');
  }),

  location: asyncHandler(async (req, res) => ok(res, await locationService.recordLocation(req.user.id, req.body))),
};
