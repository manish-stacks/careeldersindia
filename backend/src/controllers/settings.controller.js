const { z } = require('zod');
const { asyncHandler } = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const Setting = require('../models/Setting');
const Enquiry = require('../models/Enquiry');
const { parsePagination, pageMeta, escapeRegex } = require('../utils/pagination');
const notifications = require('../services/notification.service');

const DEFAULTS = {
  email: 'support@careeldersindia.com',
  phone: '',
  whatsapp: '',
  address: '',
  website: 'https://careeldersindia.com',
  hours: '',
  facebook: '',
  instagram: '',
  linkedin: '',
  youtube: '',
};

const LEGAL_DEFAULTS = {
  privacy: `# Privacy Policy

We collect only the information needed to arrange and record home care visits, such as names, contact details, addresses and health observations entered during a visit.

# How we use your information

Your information is used to book visits, assign care assistants, create visit reports for your family and keep everyone safe. We do not sell personal data.

# Who can see it

Only you, the family members you authorise, the assigned care assistant and our care desk can see a visit record.

# Contact us

For any question about your data, please use the contact details on our Contact page.`,
  terms: `# Terms and Conditions

By using Care Elders India you agree to these terms.

# Our service

We arrange home visits by trained care assistants. Visit reports contain recorded measurements and observations. They are not a medical diagnosis.

# Bookings and payments

Bookings are confirmed after payment and verification by our care desk. Refunds follow our cancellation policy shown at the time of booking.

# Emergencies

In an emergency, call your local emergency number first.

# Contact us

For any question about these terms, please use the contact details on our Contact page.`,
};
const LEGAL_TITLES = { privacy: 'Privacy Policy', terms: 'Terms and Conditions' };
const legalSchema = z.object({ privacy: z.string().max(60000).optional(), terms: z.string().max(60000).optional() });
async function readLegal() {
  const doc = await Setting.findOne({ key: 'legal' }).lean();
  const v = doc?.value || {};
  return { privacy: v.privacy?.trim() ? v.privacy : LEGAL_DEFAULTS.privacy, terms: v.terms?.trim() ? v.terms : LEGAL_DEFAULTS.terms };
}

const text = (max) => z.string().trim().max(max).optional().or(z.literal(''));
const contactSchema = z.object({
  email: z.string().trim().email().max(120).optional().or(z.literal('')),
  phone: text(30),
  whatsapp: text(30),
  address: text(300),
  website: text(120),
  hours: text(120),
  facebook: text(200),
  instagram: text(200),
  linkedin: text(200),
  youtube: text(200),
});

const enquirySchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(120),
  phone: text(30),
  message: z.string().trim().min(10).max(1500),
});

const enquiryListSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['open', 'handled']).optional().or(z.literal('')),
  q: z.string().max(100).optional(),
});
const enquiryUpdateSchema = z.object({ handled: z.boolean() });

async function read() {
  const doc = await Setting.findOne({ key: 'contact' }).lean();
  return { ...DEFAULTS, ...(doc?.value || {}) };
}

module.exports = {
  legalSchema,
  getLegal: asyncHandler(async (_req, res) => ok(res, await readLegal())),
  updateLegal: asyncHandler(async (req, res) => {
    const value = { ...(await readLegal()), ...req.body };
    await Setting.findOneAndUpdate({ key: 'legal' }, { value }, { upsert: true, new: true });
    ok(res, value, 'Legal pages updated');
  }),
  // Public: one legal page by slug (privacy | terms)
  getLegalPage: asyncHandler(async (req, res) => {
    const slug = req.params.slug;
    if (!LEGAL_TITLES[slug]) return res.status(404).json({ success: false, message: 'Page not found' });
    ok(res, { title: LEGAL_TITLES[slug], body: (await readLegal())[slug] });
  }),
  contactSchema,
  enquirySchema,
  enquiryListSchema,
  enquiryUpdateSchema,
  // Admin: list website enquiries (newest first)
  listEnquiries: asyncHandler(async (req, res) => {
    const pg = parsePagination(req.query);
    const filter = {};
    if (req.query.status === 'open') filter.handled = false;
    if (req.query.status === 'handled') filter.handled = true;
    if (req.query.q) {
      const rx = new RegExp(escapeRegex(req.query.q), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { message: rx }];
    }
    const [items, total] = await Promise.all([
      Enquiry.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(),
      Enquiry.countDocuments(filter),
    ]);
    ok(res, items, 'OK', 200, pageMeta(pg, total));
  }),
  updateEnquiry: asyncHandler(async (req, res) => {
    const handled = req.body.handled;
    const doc = await Enquiry.findByIdAndUpdate(
      req.params.id,
      handled ? { handled: true, handledAt: new Date(), handledBy: req.user._id || req.user.id } : { handled: false, $unset: { handledAt: 1, handledBy: 1 } },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ success: false, message: 'Enquiry not found' });
    ok(res, doc, 'Enquiry updated');
  }),
  // Public website contact form → notifies every admin
  enquiry: asyncHandler(async (req, res) => {
    const { name, email, phone, message } = req.body;
    await Enquiry.create({ name, email, phone: phone || '', message, ip: req.ip });
    await notifications.notifyAdmins({ type: 'WEB_ENQUIRY', title: `Website enquiry from ${name}`, body: `${message}\n\nEmail: ${email}${phone ? `\nPhone: ${phone}` : ''}`.slice(0, 1800), data: { email, phone: phone || '' }, push: false });
    ok(res, {}, 'Thank you. Our care desk will contact you shortly.');
  }),
  getContact: asyncHandler(async (_req, res) => ok(res, await read())),
  updateContact: asyncHandler(async (req, res) => {
    const value = { ...(await read()), ...req.body };
    await Setting.findOneAndUpdate({ key: 'contact' }, { value }, { upsert: true, new: true });
    ok(res, value, 'Contact details updated');
  }),
};
