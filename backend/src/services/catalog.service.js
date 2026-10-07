const { Service, Booking } = require('../models');
const { ApiError } = require('../utils/ApiError');
const { TERMINAL_STATUSES } = require('../config/constants');
const { audit } = require('./audit.service');

async function listActive() {
  return Service.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
}

async function listAll() {
  return Service.find().sort({ sortOrder: 1, name: 1 }).lean();
}

async function getById(id, { activeOnly = true } = {}) {
  const service = await Service.findOne({ _id: id, ...(activeOnly && { isActive: true }) });
  if (!service) throw ApiError.notFound('Service not found', 'SERVICE_NOT_FOUND');
  return service;
}

const slugKey = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50) || 'item';
/** labels -> [{key,label}]; an unchanged label keeps its old key so past reports stay readable. */
function toItems(labels, existing = []) {
  const old = new Map(existing.map((i) => [i.label, i.key]));
  const used = new Set();
  return labels.map((label) => {
    let key = old.get(label) || slugKey(label);
    while (used.has(key)) key += '_';
    used.add(key);
    return { key, label };
  });
}

async function create(admin, input, req) {
  const { items, ...rest } = input;
  const service = await Service.create({ ...rest, items: toItems(items || []) });
  await audit({ actor: admin, action: 'SERVICE_CREATED', entityType: 'Service', entityId: service._id, metadata: { name: service.name }, req });
  return service;
}

async function update(admin, id, input, req) {
  const service = await getById(id, { activeOnly: false });
  const { items, ...rest } = input;
  service.set(rest);
  if (items) service.items = toItems(items, service.items.map((i) => ({ key: i.key, label: i.label })));
  await service.save();
  await audit({ actor: admin, action: 'SERVICE_UPDATED', entityType: 'Service', entityId: service._id, metadata: { fields: Object.keys(input) }, req });
  return service;
}

async function deactivate(admin, id, req) {
  const service = await getById(id, { activeOnly: false });
  const pending = await Booking.countDocuments({ serviceId: id, status: { $nin: TERMINAL_STATUSES } });
  service.isActive = false;
  await service.save();
  await audit({ actor: admin, action: 'SERVICE_DEACTIVATED', entityType: 'Service', entityId: id, metadata: { pendingBookings: pending }, req });
  return { service, pendingBookings: pending };
}

/** Price in paise (INR). Recurring visits get the service's configured discount. */
function priceFor(service, { recurring = false } = {}) {
  const base = service.basePrice;
  const discount = recurring ? Math.round((base * (service.recurringDiscountPercent || 0)) / 100) : 0;
  return { amount: base - discount, discount, currency: service.currency || 'INR' };
}

/**
 * Sheets shown to the visiting assistant. selections = [{ serviceId, itemKeys? }] (itemKeys omitted = every child item).
 * Result is frozen into booking.serviceSnapshot.sheets, so later admin edits never change past visits.
 */
async function sheetSnapshots(selections = []) {
  const out = [];
  for (const sel of selections) {
    const svc = await Service.findById(sel.serviceId).lean();
    if (!svc || svc.sheetKind === 'NONE' || !svc.items?.length) continue;
    const keys = sel.itemKeys?.length ? new Set(sel.itemKeys) : null;
    const items = svc.items.filter((i) => !keys || keys.has(i.key));
    if (items.length) out.push({ serviceId: svc._id, name: svc.name, kind: svc.sheetKind, items });
  }
  return out;
}

module.exports = { sheetSnapshots, listActive, listAll, getById, create, update, deactivate, priceFor };
