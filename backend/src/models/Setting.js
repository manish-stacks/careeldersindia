const mongoose = require('mongoose');

// Single-document-per-key store for admin-editable settings (key "contact" holds the public contact details).
const settingSchema = new mongoose.Schema(
  { key: { type: String, required: true, unique: true }, value: { type: mongoose.Schema.Types.Mixed, default: {} } },
  { timestamps: true },
);
module.exports = mongoose.model('Setting', settingSchema);
