const { ApiError } = require('../utils/ApiError');

// /admin/<first-segment> → permission module. Anything not listed is denied (super admin only).
const MODULE_BY_SEGMENT = {
  dashboard: 'dashboard',
  'live-map': 'live_map',
  bookings: 'bookings',
  customers: 'customers',
  parents: 'customers',
  users: 'customers',
  enquiries: 'customers',
  assistants: 'assistants',
  'assistant-documents': 'assistants',
  services: 'services',
  'recurring-plans': 'plans',
  plans: 'plans',
  payments: 'payments',
  reports: 'reports',
  corrections: 'reports',
  'health-visits': 'reports',
  'emergency-alerts': 'alerts',
  'audit-logs': 'audit',
  notifications: 'notifications',
  staff: 'staff',
  roles: 'staff',
  permissions: 'staff',
};

/** Router-level guard for /admin/*: GET → <module>.view, everything else → <module>.manage. */
function adminGuard(req, _res, next) {
  const seg = req.path.split('/').filter(Boolean)[0];
  const mod = MODULE_BY_SEGMENT[seg];
  if (!mod) return req.user.isSuper ? next() : next(ApiError.forbidden());
  const need = `${mod}.${req.method === 'GET' ? 'view' : 'manage'}`;
  if (!req.user.permissions.includes(need)) return next(ApiError.forbidden('Your role does not allow this action', 'PERMISSION_DENIED'));
  return next();
}

module.exports = { adminGuard };
