const mongoose = require('mongoose');
const { VITAL_KEYS, DEFAULT_SYMPTOMS } = require('../config/constants');

const serviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, trim: true },
    basePrice: { type: Number, required: true, min: 0 }, // paise (INR)
    currency: { type: String, default: 'INR' },
    durationMinutes: { type: Number, required: true, min: 15, max: 480 },
    recurringDiscountPercent: { type: Number, min: 0, max: 50, default: 0 },
    // What the assistant must capture during the visit (drives the mobile form)
    fields: {
      vitals: [{ key: { type: String, enum: VITAL_KEYS }, required: { type: Boolean, default: true } }],
      collectSymptoms: { type: Boolean, default: true },
      collectMedication: { type: Boolean, default: true },
      collectMobility: { type: Boolean, default: false },
      collectWellbeing: { type: Boolean, default: false },
      minPhotos: { type: Number, min: 0, max: 10, default: 0 },
      dailyChecklist: { type: Boolean, default: false }, // show the 27-item Daily Services Entry Sheet
      labPanel: { type: String, enum: ['NONE', 'HAEMATOLOGY'], default: 'NONE' }, // Blood Haematology Report table
    },
    // Parent sheet (e.g. "Daily Services Entry Sheet") with admin-managed child items
    sheetKind: { type: String, enum: ['NONE', 'CHECKLIST', 'TABLE'], default: 'NONE' }, // CHECKLIST = tick done; TABLE = value per row or report image
    items: [{ key: { type: String, required: true }, label: { type: String, required: true, trim: true, maxlength: 80 }, _id: false }],
    symptomsList: { type: [String], default: DEFAULT_SYMPTOMS },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

serviceSchema.index({ slug: 1 }, { unique: true });
serviceSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('Service', serviceSchema);
