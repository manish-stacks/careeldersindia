const mongoose = require('mongoose');

// Message sent from the public website Contact page.
const enquirySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true, default: '' },
    message: { type: String, required: true },
    handled: { type: Boolean, default: false },
    handledAt: Date,
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ip: String,
  },
  { timestamps: true }
);

enquirySchema.index({ handled: 1, createdAt: -1 });

module.exports = mongoose.model('Enquiry', enquirySchema);
