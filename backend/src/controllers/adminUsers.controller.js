const { asyncHandler } = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const s = require('../services/adminUsers.service');

module.exports = {
  createCustomer: asyncHandler(async (req, res) => created(res, await s.createCustomer(req.user, req.body, req), 'Customer created')),
  createAssistant: asyncHandler(async (req, res) => created(res, await s.createAssistant(req.user, req.body, req), 'Assistant created')),
  createParent: asyncHandler(async (req, res) => created(res, await s.createParentFor(req.user, req.params.id, req.body, req), 'Parent added')),
  setLogin: asyncHandler(async (req, res) => ok(res, await s.setLoginAccess(req.user, req.params.id, req.body.enabled, req), req.body.enabled ? 'Login enabled' : 'Login disabled')),
  resetPassword: asyncHandler(async (req, res) => ok(res, await s.resetPassword(req.user, req.params.id, req), 'Password reset')),
  createPlan: asyncHandler(async (req, res) => created(res, await s.createPlanFor(req.user, req.body, req), 'Plan created')),
  updateAssistant: asyncHandler(async (req, res) => ok(res, await s.updateAssistant(req.user, req.params.id, req.body, req), 'Assistant updated')),
  addAssistantDocument: asyncHandler(async (req, res) => created(res, await s.addAssistantDocument(req.user, req.params.id, req.file, req.body, req), 'Document uploaded')),
  deleteAssistantDocument: asyncHandler(async (req, res) => ok(res, await s.deleteAssistantDocument(req.user, req.params.id, req), 'Document removed')),
  deleteCustomer: asyncHandler(async (req, res) => ok(res, await s.deleteUser(req.user, req.params.id, 'CUSTOMER', req, { force: req.query.force === 'true' }), 'Customer deleted')),
  deleteAssistant: asyncHandler(async (req, res) => ok(res, await s.deleteUser(req.user, req.params.id, 'ASSISTANT', req), 'Assistant deleted')),
};
