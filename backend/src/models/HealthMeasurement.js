const mongoose = require('mongoose');

// Flattened measurement series per parent — powers trend charts & long-term history.
const healthMeasurementSchema = new mongoose.Schema(
  {
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', required: true },
    visitId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthVisit', required: true },
    type: { type: String, enum: ['BP_SYSTOLIC', 'BP_DIASTOLIC', 'PULSE', 'SPO2', 'TEMPERATURE', 'WEIGHT', 'BLOOD_SUGAR'], required: true },
    value: { type: Number, required: true },
    unit: String,
    context: String, // e.g. FASTING
    recordedAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false }
);

healthMeasurementSchema.index({ parentId: 1, type: 1, recordedAt: -1 });
healthMeasurementSchema.index({ visitId: 1 });

module.exports = mongoose.model('HealthMeasurement', healthMeasurementSchema);
