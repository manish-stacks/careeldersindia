const bcrypt = require('bcryptjs');
const { z, objectId, email, mobile, password } = require('../validators/common');
const { asyncHandler } = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const { ApiError } = require('../utils/ApiError');
const { User, Role } = require('../models');
const { MODULES, ALL_PERMISSIONS, expand } = require('../config/permissions');
const { audit } = require('../services/audit.service');
const { revokeAllForUser } = require('../services/token.service');

const perms = z.array(z.enum(ALL_PERMISSIONS)).max(ALL_PERMISSIONS.length);
const schemas = {
  role: z.object({ name: z.string().trim().min(2).max(60), description: z.string().trim().max(200).optional(), permissions: perms }),
  rolePatch: z.object({ name: z.string().trim().min(2).max(60), description: z.string().trim().max(200), permissions: perms }).partial(),
  staff: z.object({ name: z.string().trim().min(2).max(120), email, mobile: mobile.optional(), password, roleId: objectId.nullable() }),
  staffPatch: z.object({ name: z.string().trim().min(2).max(120), mobile: mobile, roleId: objectId.nullable(), status: z.enum(['ACTIVE', 'SUSPENDED']), password }).partial(),
};

const hash = (p) => bcrypt.hash(p, 12);
const staffView = (u, role) => ({ _id: u._id, name: u.name, email: u.email, mobile: u.mobile, status: u.status, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt, roleId: u.adminRole || null, roleName: u.adminRole ? role?.name || 'Unknown' : 'Super admin', isSuper: !u.adminRole });

/** A delegated admin can only hand out permissions they hold themselves (no privilege escalation). */
function assertCanGrant(actor, granted) {
  if (actor.isSuper) return;
  const missing = granted.filter((p) => !actor.permissions.includes(p));
  if (missing.length) throw ApiError.forbidden('You can only grant permissions you have yourself', 'PRIVILEGE_ESCALATION');
}
async function resolveRole(actor, roleId) {
  if (!roleId) {
    if (!actor.isSuper) throw ApiError.forbidden('Only a super admin can create another super admin', 'PRIVILEGE_ESCALATION');
    return null;
  }
  const role = await Role.findById(roleId).lean();
  if (!role) throw ApiError.badRequest('Role not found', 'ROLE_NOT_FOUND');
  assertCanGrant(actor, expand(role.permissions));
  return role;
}
// Only super admins may modify a super admin account.
function assertCanTouch(actor, target) {
  if (!target.adminRole && !actor.isSuper) throw ApiError.forbidden('Only a super admin can modify a super admin', 'FORBIDDEN');
}

module.exports = {
  schemas,

  catalogue: asyncHandler(async (_req, res) => ok(res, { modules: MODULES })),

  // ------------------------------------------------------------ roles
  listRoles: asyncHandler(async (_req, res) => {
    const [roles, counts] = await Promise.all([Role.find().sort({ name: 1 }).lean(), User.aggregate([{ $match: { role: 'ADMIN', adminRole: { $ne: null } } }, { $group: { _id: '$adminRole', n: { $sum: 1 } } }])]);
    const byRole = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
    return ok(res, roles.map((r) => ({ ...r, memberCount: byRole[String(r._id)] || 0 })));
  }),

  createRole: asyncHandler(async (req, res) => {
    const permissions = expand(req.body.permissions);
    assertCanGrant(req.user, permissions);
    if (await Role.exists({ name: req.body.name }).collation({ locale: 'en', strength: 2 })) throw ApiError.conflict('A role with this name already exists', 'DUPLICATE_ROLE');
    const role = await Role.create({ ...req.body, permissions, createdBy: req.user.id });
    await audit({ actor: req.user, action: 'ROLE_CREATED', entityType: 'Role', entityId: role._id, metadata: { name: role.name, permissions }, req });
    return created(res, role);
  }),

  updateRole: asyncHandler(async (req, res) => {
    const role = await Role.findById(req.params.id);
    if (!role) throw ApiError.notFound('Role not found');
    if (req.body.permissions) {
      req.body.permissions = expand(req.body.permissions);
      assertCanGrant(req.user, req.body.permissions);
      // Editing your own role could lock you out or escalate — super admin only.
      if (String(req.user.roleId) === String(role._id) && !req.user.isSuper) throw ApiError.forbidden('You cannot edit your own role', 'FORBIDDEN');
    }
    if (req.body.name && (await Role.exists({ name: req.body.name, _id: { $ne: role._id } }).collation({ locale: 'en', strength: 2 }))) throw ApiError.conflict('A role with this name already exists', 'DUPLICATE_ROLE');
    Object.assign(role, req.body);
    await role.save();
    await audit({ actor: req.user, action: 'ROLE_UPDATED', entityType: 'Role', entityId: role._id, metadata: req.body, req });
    return ok(res, role, 'Role updated');
  }),

  deleteRole: asyncHandler(async (req, res) => {
    const role = await Role.findById(req.params.id);
    if (!role) throw ApiError.notFound('Role not found');
    const inUse = await User.countDocuments({ adminRole: role._id });
    if (inUse) throw ApiError.conflict(`${inUse} team member(s) still use this role. Reassign them first.`, 'ROLE_IN_USE');
    await role.deleteOne();
    await audit({ actor: req.user, action: 'ROLE_DELETED', entityType: 'Role', entityId: role._id, metadata: { name: role.name }, req });
    return ok(res, {}, 'Role deleted');
  }),

  // ------------------------------------------------------------ staff
  listStaff: asyncHandler(async (_req, res) => {
    const users = await User.find({ role: 'ADMIN', status: { $ne: 'DELETED' } }).sort({ createdAt: 1 }).lean();
    const roles = await Role.find({ _id: { $in: users.map((u) => u.adminRole).filter(Boolean) } }).lean();
    const map = Object.fromEntries(roles.map((r) => [String(r._id), r]));
    return ok(res, users.map((u) => staffView(u, map[String(u.adminRole)])));
  }),

  createStaff: asyncHandler(async (req, res) => {
    const role = await resolveRole(req.user, req.body.roleId);
    if (await User.exists({ email: req.body.email })) throw ApiError.conflict('This email is already registered', 'DUPLICATE_EMAIL');
    if (req.body.mobile && (await User.exists({ mobile: req.body.mobile }))) throw ApiError.conflict('This mobile is already registered', 'DUPLICATE_MOBILE');
    const user = await User.create({ name: req.body.name, email: req.body.email, mobile: req.body.mobile, role: 'ADMIN', adminRole: role?._id, passwordHash: await hash(req.body.password) });
    await audit({ actor: req.user, action: 'STAFF_CREATED', entityType: 'User', entityId: user._id, metadata: { email: user.email, role: role?.name || 'Super admin' }, req });
    return created(res, staffView(user.toObject(), role));
  }),

  updateStaff: asyncHandler(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, role: 'ADMIN' });
    if (!user) throw ApiError.notFound('Team member not found');
    assertCanTouch(req.user, user);
    const isSelf = String(user._id) === req.user.id;
    const { roleId, status, password: pwd, ...rest } = req.body;
    if (isSelf && (roleId !== undefined || status)) throw ApiError.badRequest('You cannot change your own role or status', 'SELF_CHANGE');
    let role = null;
    if (roleId !== undefined) {
      role = await resolveRole(req.user, roleId);
      // Never leave the system without a super admin
      if (!user.adminRole && roleId && (await User.countDocuments({ role: 'ADMIN', adminRole: null, status: 'ACTIVE' })) <= 1) throw ApiError.conflict('At least one active super admin is required', 'LAST_SUPER_ADMIN');
      user.adminRole = role?._id || undefined;
    }
    if (status) {
      if (status === 'SUSPENDED' && !user.adminRole && (await User.countDocuments({ role: 'ADMIN', adminRole: null, status: 'ACTIVE' })) <= 1) throw ApiError.conflict('At least one active super admin is required', 'LAST_SUPER_ADMIN');
      user.status = status;
    }
    Object.assign(user, rest);
    if (pwd) {
      user.passwordHash = await hash(pwd);
      user.passwordChangedAt = new Date();
    }
    await user.save();
    if (pwd || status === 'SUSPENDED') await revokeAllForUser(user._id);
    await audit({ actor: req.user, action: 'STAFF_UPDATED', entityType: 'User', entityId: user._id, metadata: { ...rest, roleId, status, passwordReset: !!pwd }, req });
    const r = user.adminRole ? await Role.findById(user.adminRole).lean() : null;
    return ok(res, staffView(user.toObject(), r), 'Team member updated');
  }),
};
