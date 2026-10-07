const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24h)');
const mobile = z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid mobile number with country code');
const email = z.string().trim().toLowerCase().email('Enter a valid email');
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');
const pincode = z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code');
const pageQuery = z.object({ page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(200).optional() }).passthrough();
const idParam = z.object({ id: objectId });

const address = z.object({
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional(),
  landmark: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode,
});

module.exports = { z, objectId, date, time, mobile, email, password, pincode, pageQuery, idParam, address };
