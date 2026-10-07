/**
 * Admin RBAC catalogue. Each module has `view` and `manage` (manage implies view).
 * Keep in sync with admin/src/lib/permissions.ts.
 */
const MODULES = [
  { key: 'dashboard', label: 'Dashboard', actions: ['view'] },
  { key: 'bookings', label: 'Bookings', actions: ['view', 'manage'] },
  { key: 'live_map', label: 'Live map', actions: ['view'] },
  { key: 'alerts', label: 'Emergency alerts', actions: ['view', 'manage'] },
  { key: 'customers', label: 'Customers & parents', actions: ['view', 'manage'] },
  { key: 'assistants', label: 'Assistants', actions: ['view', 'manage'] },
  { key: 'reports', label: 'Reports', actions: ['view', 'manage'] },
  { key: 'plans', label: 'Recurring plans', actions: ['view', 'manage'] },
  { key: 'services', label: 'Services', actions: ['view', 'manage'] },
  { key: 'payments', label: 'Payments & refunds', actions: ['view', 'manage'] },
  { key: 'notifications', label: 'Notifications', actions: ['view', 'manage'] },
  { key: 'audit', label: 'Audit log', actions: ['view'] },
  { key: 'staff', label: 'Team & roles', actions: ['view', 'manage'] },
];

const ALL_PERMISSIONS = MODULES.flatMap((m) => m.actions.map((a) => `${m.key}.${a}`));

/** manage ⇒ view */
function expand(perms = []) {
  const set = new Set(perms.filter((p) => ALL_PERMISSIONS.includes(p)));
  for (const p of [...set]) if (p.endsWith('.manage')) set.add(p.replace('.manage', '.view'));
  return [...set].filter((p) => ALL_PERMISSIONS.includes(p));
}

module.exports = { MODULES, ALL_PERMISSIONS, expand };
