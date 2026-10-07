const mongoose = require('mongoose');

/**
 * Admin-managed paper sheet digitised for the assistant app.
 *  CHECKLIST — assistant ticks the procedures performed (e.g. "Daily Services Entry Sheet")
 *  TABLE     — assistant types a value per row (e.g. "Blood Haematology Report") or uploads a photo of the report
 */
const reportTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    kind: { type: String, enum: ['CHECKLIST', 'TABLE'], required: true },
    items: [{ key: { type: String, required: true }, label: { type: String, required: true, trim: true, maxlength: 80 }, _id: false }],
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);
reportTemplateSchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model('ReportTemplate', reportTemplateSchema);
