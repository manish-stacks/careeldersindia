const { z } = require('zod');
const { asyncHandler } = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const Setting = require('../models/Setting');

const DEFAULTS = {
  email: 'support@careeldersindia.com',
  phone: '',
  whatsapp: '',
  address: '',
  website: 'https://careeldersindia.com',
  hours: '',
};

const text = (max) => z.string().trim().max(max).optional().or(z.literal(''));
const contactSchema = z.object({
  email: z.string().trim().email().max(120).optional().or(z.literal('')),
  phone: text(30),
  whatsapp: text(30),
  address: text(300),
  website: text(120),
  hours: text(120),
});

async function read() {
  const doc = await Setting.findOne({ key: 'contact' }).lean();
  return { ...DEFAULTS, ...(doc?.value || {}) };
}

module.exports = {
  contactSchema,
  getContact: asyncHandler(async (_req, res) => ok(res, await read())),
  updateContact: asyncHandler(async (req, res) => {
    const value = { ...(await read()), ...req.body };
    await Setting.findOneAndUpdate({ key: 'contact' }, { value }, { upsert: true, new: true });
    ok(res, value, 'Contact details updated');
  }),
};
