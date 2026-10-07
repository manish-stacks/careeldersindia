const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false });
const Counter = mongoose.model('Counter', counterSchema);

/** Human-readable sequential numbers, e.g. BK-2026-000123 */
async function nextNumber(prefix) {
  const year = new Date().getUTCFullYear();
  const key = `${prefix}-${year}`;
  const doc = await Counter.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `${prefix}-${year}-${String(doc.seq).padStart(6, '0')}`;
}

module.exports = { Counter, nextNumber };
