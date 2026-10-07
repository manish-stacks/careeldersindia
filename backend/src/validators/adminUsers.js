const { z } = require('zod');
const { objectId } = require('./common');
const date = /^\d{4}-\d{2}-\d{2}$/;
const base = {
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  mobile: z.string().trim().min(6).max(20).optional(),
  country: z.string().trim().max(2).optional(),
  timezone: z.string().trim().max(60).optional(), // e.g. America/New_York
  password: z.string().min(8).max(100).optional(), // omitted → a temporary password is generated
  loginEnabled: z.boolean().default(true),
};
module.exports = {
  customer: z.object(base),
  assistant: z.object({ ...base, serviceIds: z.array(objectId).optional(), serviceAreas: z.array(z.any()).optional() }),
  login: z.object({ enabled: z.boolean() }),
  plan: z.object({
    customerId: objectId, parentId: objectId, serviceId: objectId.optional(),
    sheets: z.array(z.object({ serviceId: objectId, itemKeys: z.array(z.string().max(60)).max(150).optional() })).min(1).max(10).optional(),
    assistantId: objectId.optional(),
    frequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM']).default('DAILY'),
    intervalDays: z.number().int().min(1).max(90).optional(),
    startDate: z.string().regex(date), time: z.string().regex(/^\d{2}:\d{2}$/),
    endDate: z.string().regex(date).optional(), // plan runs startDate → endDate
    totalVisits: z.number().int().min(1).max(400).optional(), // used when endDate is not given
    pricePerVisit: z.number().int().min(0).optional(), notes: z.string().max(1000).optional(),
  }),
  planUpdate: z.object({
    frequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM']).optional(),
    intervalDays: z.number().int().min(1).max(90).optional(),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    fromDate: z.string().regex(date).optional(), // new schedule applies from this date (default: tomorrow)
    endDate: z.string().regex(date).optional(),
    totalVisits: z.number().int().min(1).max(400).optional(),
    assistantId: objectId.nullable().optional(),
    pricePerVisit: z.number().int().min(0).optional(),
    sheets: z.array(z.object({ serviceId: objectId, itemKeys: z.array(z.string().max(60)).max(150).optional() })).min(1).max(10).optional(),
    notes: z.string().max(1000).optional(),
  }),
  renew: z.object({
    startDate: z.string().regex(date).optional(), endDate: z.string().regex(date).optional(),
    totalVisits: z.number().int().min(1).max(400).optional(),
    frequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM']).optional(), intervalDays: z.number().int().min(1).max(90).optional(),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional(), assistantId: objectId.optional(), pricePerVisit: z.number().int().min(0).optional(), notes: z.string().max(1000).optional(),
  }),
  payment: z.object({
    amount: z.number().int().min(0).optional(), status: z.enum(['CREATED', 'CAPTURED', 'FAILED']).optional(),
    method: z.string().trim().max(40).optional(), reference: z.string().trim().max(120).optional(), note: z.string().trim().max(500).optional(),
    capturedAt: z.string().max(40).optional(),
  }),
  assistantUpdate: z.object({
    name: z.string().trim().min(2).max(120).optional(), email: z.string().trim().toLowerCase().email().optional(), mobile: z.string().trim().min(6).max(20).optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(), dateOfBirth: z.coerce.date().optional(),
    address: z.object({ line1: z.string().trim().max(200).optional(), line2: z.string().trim().max(200).optional(), city: z.string().trim().max(80).optional(), state: z.string().trim().max(80).optional(), pincode: z.string().trim().max(10).optional() }).optional(),
    qualification: z.string().trim().max(200).optional(), experienceYears: z.number().int().min(0).max(60).optional(),
    languages: z.array(z.string().trim().max(40)).max(10).optional(),
    serviceAreas: z.array(z.object({ city: z.string().trim().max(80), pincodes: z.array(z.string().trim().max(10)).max(100).optional() })).max(20).optional(),
    serviceIds: z.array(objectId).max(100).optional(),
    isAvailable: z.boolean().optional(),
    workingHours: z.array(z.object({ day: z.number().int().min(0).max(6), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) })).max(7).optional(),
    bank: z.object({ accountHolder: z.string().trim().max(120).optional(), accountNumber: z.string().trim().regex(/^\d{9,18}$/).optional(), ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/).optional(), upiId: z.string().trim().max(80).optional() }).optional(),
    panNumber: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/).optional(),
  }),
  workload: z.object({ from: z.string().regex(date).optional(), to: z.string().regex(date).optional(), q: z.string().max(80).optional(), page: z.coerce.number().optional(), limit: z.coerce.number().optional(), sort: z.enum(['assigned', 'name', 'completed']).optional() }),
  sheetQuery: z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    format: z.enum(['xlsx', 'pdf']).default('xlsx'),
  }),
};
