const { ReportTemplate, Service } = require('../models');
const { ApiError } = require('../utils/ApiError');
const { audit } = require('./audit.service');

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const keyOf = (s) => slugify(s).replace(/-/g, '_').slice(0, 50);

/** Accepts items as strings or {label}; builds unique stable keys from labels. */
function normaliseItems(items) {
  const seen = new Set();
  return items.map((it) => {
    const label = (typeof it === 'string' ? it : it.label).trim();
    let key = (typeof it === 'object' && it.key) || keyOf(label) || 'item';
    while (seen.has(key)) key += '_';
    seen.add(key);
    return { key, label };
  });
}

const list = ({ activeOnly = false } = {}) => ReportTemplate.find(activeOnly ? { isActive: true } : {}).sort({ sortOrder: 1, name: 1 }).lean();

async function create(admin, input, req) {
  const slug = slugify(input.name);
  if (await ReportTemplate.exists({ slug })) throw ApiError.conflict('A template with this name already exists', 'TEMPLATE_EXISTS');
  const t = await ReportTemplate.create({ ...input, slug, items: normaliseItems(input.items) });
  await audit({ actor: admin, action: 'REPORT_TEMPLATE_CREATED', entityType: 'ReportTemplate', entityId: t._id, req });
  return t;
}

async function update(admin, id, input, req) {
  const t = await ReportTemplate.findById(id);
  if (!t) throw ApiError.notFound('Template not found', 'TEMPLATE_NOT_FOUND');
  const { items, ...rest } = input;
  Object.assign(t, rest);
  if (items) { // keep the key of unchanged labels so old reports stay readable
    const old = new Map(t.items.map((i) => [i.label, i.key]));
    t.items = normaliseItems(items).map((i) => ({ key: old.get(i.label) || i.key, label: i.label }));
  }
  await t.save();
  await audit({ actor: admin, action: 'REPORT_TEMPLATE_UPDATED', entityType: 'ReportTemplate', entityId: t._id, req });
  return t;
}

async function remove(admin, id, req) {
  const t = await ReportTemplate.findById(id);
  if (!t) throw ApiError.notFound('Template not found', 'TEMPLATE_NOT_FOUND');
  t.isActive = false; // soft: past visit reports keep their own copy of the data
  await t.save();
  await Service.updateMany({}, { $pull: { 'fields.reportTemplateIds': t._id } });
  await audit({ actor: admin, action: 'REPORT_TEMPLATE_HIDDEN', entityType: 'ReportTemplate', entityId: t._id, req });
  return t;
}

/** Templates for a booking's service. Old bookings that only carry the legacy flags map to the seeded sheets. */
async function forService(fields = {}) {
  const ids = (fields.reportTemplateIds || []).map(String);
  const slugs = [];
  if (fields.dailyChecklist) slugs.push('daily-services-entry-sheet');
  if (fields.labPanel === 'HAEMATOLOGY') slugs.push('blood-haematology-report');
  const found = await ReportTemplate.find({ isActive: true, $or: [{ _id: { $in: ids } }, { slug: { $in: slugs } }] }).sort({ sortOrder: 1 }).lean();
  return found.map((t) => ({ _id: String(t._id), name: t.name, kind: t.kind, items: t.items }));
}

module.exports = { list, create, update, remove, forService, slugify };
