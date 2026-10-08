const { z } = require('zod');
const { VITAL_LIMITS: L, OVERALL_STATUS } = require('../config/constants');

const num = (min, max, label) =>
  z.number({ invalid_type_error: `${label} must be a number` }).finite().min(min, `${label} must be ≥ ${min}`).max(max, `${label} must be ≤ ${max}`);

const measurements = z
  .object({
    bp: z
      .object({ systolic: num(...L.bpSystolic, 'Systolic BP'), diastolic: num(...L.bpDiastolic, 'Diastolic BP') })
      .refine((v) => v.systolic > v.diastolic, { message: 'Systolic must be higher than diastolic' })
      .optional(),
    pulse: num(...L.pulse, 'Pulse').int().optional(),
    spo2: num(...L.spo2, 'SpO2').optional(),
    temperature: z
      .object({ value: z.number().finite(), unit: z.enum(['F', 'C']).default('F') })
      .superRefine((t, ctx) => {
        const [min, max] = t.unit === 'C' ? L.temperatureC : L.temperatureF;
        if (t.value < min || t.value > max) ctx.addIssue({ code: 'custom', message: `Temperature must be between ${min} and ${max} °${t.unit}` });
      })
      .optional(),
    weight: z.object({ value: num(...L.weightKg, 'Weight (kg)'), unit: z.literal('KG').default('KG') }).optional(),
    bloodSugar: z.object({ value: num(...L.bloodSugarMgDl, 'Blood sugar (mg/dL)'), unit: z.literal('mg/dL').default('mg/dL'), context: z.enum(['FASTING', 'RANDOM', 'POST_MEAL']) }).optional(),
  })
  .strict();

const visitDraft = z
  .object({
    measurements: measurements.optional(),
    symptoms: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
    symptomNotes: z.string().trim().max(2000).optional(),
    medicationStatus: z
      .array(
        z.object({
          medicineName: z.string().trim().min(1).max(120),
          slot: z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT']),
          status: z.enum(['TAKEN', 'MISSED', 'NOT_DUE', 'UNKNOWN']),
          reportedBy: z.enum(['PATIENT', 'ASSISTANT', 'FAMILY', 'CAREGIVER']).default('PATIENT'),
        })
      )
      .max(60)
      .optional(),
    mobility: z.enum(['INDEPENDENT', 'NEEDS_SUPPORT', 'ASSISTED_DEVICE', 'BEDRIDDEN']).optional(),
    wellbeing: z
      .object({
        appetite: z.enum(['GOOD', 'REDUCED', 'POOR']).optional(),
        sleep: z.enum(['GOOD', 'DISTURBED', 'POOR']).optional(),
        mood: z.enum(['CHEERFUL', 'CALM', 'LOW', 'ANXIOUS', 'CONFUSED']).optional(),
        hydration: z.enum(['ADEQUATE', 'LOW']).optional(),
      })
      .optional(),
    notes: z.string().trim().max(5000).optional(),
    reportMode: z.enum(['FORM', 'IMAGE']).optional(),
    servicesPerformed: z.array(z.string().trim().min(1).max(80)).max(60).optional(),
    reports: z.array(z.object({
      templateId: z.string().regex(/^[a-f\d]{24}$/i), name: z.string().max(80), kind: z.enum(['CHECKLIST', 'TABLE']), reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      checked: z.array(z.string().max(60)).max(100).default([]),
      values: z.array(z.object({ key: z.string().max(60), label: z.string().max(80), value: z.string().trim().max(200) })).max(100).default([]),
    })).max(20).optional(),
    labReport: z.object({
      reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      values: z.array(z.object({ key: z.string().max(40), label: z.string().max(60), value: z.string().trim().max(200) })).max(60),
    }).optional(),
    overallStatus: z.enum(Object.values(OVERALL_STATUS)).optional(),
    urgent: z
      .object({
        reason: z.string().trim().min(3).max(500),
        notes: z.string().trim().min(3).max(2000),
        recommendedEscalation: z.enum(['CALL_FAMILY', 'CALL_DOCTOR', 'AMBULANCE', 'HOSPITAL_VISIT', 'OTHER']),
      })
      .optional(),
    followUpRequired: z.boolean().optional(),
    followUpNotes: z.string().trim().max(1000).optional(),
  })
  .strict();

const visitComplete = visitDraft
  .extend({ confirm: z.literal(true, { errorMap: () => ({ message: 'Confirm the summary before completing' }) }) })
  .superRefine((v, ctx) => {
    if (v.overallStatus === OVERALL_STATUS.URGENT_ATTENTION && !v.urgent) {
      ctx.addIssue({ code: 'custom', path: ['urgent'], message: 'Reason, notes and escalation are required for urgent attention' });
    }
  });

const correction = z.object({
  field: z.enum([
    'measurements.bp',
    'measurements.pulse',
    'measurements.spo2',
    'measurements.temperature',
    'measurements.weight',
    'measurements.bloodSugar',
    'symptoms',
    'symptomNotes',
    'medicationStatus',
    'notes',
    'overallStatus',
    'followUpRequired',
    'followUpNotes',
    'reportValue',
  ]),
  newValue: z.any(),
  reason: z.string().trim().min(5).max(500),
});

module.exports = { measurements, visitDraft, visitComplete, correction };
