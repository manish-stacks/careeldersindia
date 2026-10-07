const { asyncHandler } = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const s = require('../services/reportTemplate.service');

module.exports = {
  listPublic: asyncHandler(async (_req, res) => ok(res, await s.list({ activeOnly: true }))),
  list: asyncHandler(async (_req, res) => ok(res, await s.list())),
  create: asyncHandler(async (req, res) => created(res, await s.create(req.user, req.body, req), 'Template created')),
  update: asyncHandler(async (req, res) => ok(res, await s.update(req.user, req.params.id, req.body, req), 'Template updated')),
  remove: asyncHandler(async (req, res) => ok(res, await s.remove(req.user, req.params.id, req), 'Template hidden')),
};
