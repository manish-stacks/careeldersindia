const mongoose = require('mongoose');

// Sensitive KYC documents kept separate from the profile.
const assistantDocumentSchema = new mongoose.Schema(
  {
    assistantUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['GOV_ID', 'PAN', 'QUALIFICATION', 'PROFILE_PHOTO', 'OTHER'], required: true },
    mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', required: true },
    numberEnc: { type: String, select: false },
    numberLast4: String,
    status: { type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED'], default: 'PENDING' },
    reviewNotes: String,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('AssistantDocument', assistantDocumentSchema);
