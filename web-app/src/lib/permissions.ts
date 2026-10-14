// Mirrors backend/src/config/permissions.js. `manage` implies `view`.
export type Perm = string;

/** Page prefix → permission needed to open it. First match wins. */
export const ROUTE_PERMISSIONS: [string, Perm][] = [
  ['/dashboard', 'dashboard.view'],
  ['/bookings', 'bookings.view'],
  ['/live-map', 'live_map.view'],
  ['/emergency-alerts', 'alerts.view'],
  ['/customers', 'customers.view'],
  ['/parents', 'customers.view'],
  ['/enquiries', 'customers.view'],
  ['/assistants', 'assistants.view'],
  ['/reports', 'reports.view'],
  ['/recurring-plans', 'plans.view'],
  ['/services', 'services.view'],
  ['/payments', 'payments.view'],
  ['/notifications', 'notifications.view'],
  ['/audit-logs', 'audit.view'],
  ['/team', 'staff.view'],
];

export const permissionForPath = (path: string) => ROUTE_PERMISSIONS.find(([p]) => path === p || path.startsWith(`${p}/`))?.[1];
