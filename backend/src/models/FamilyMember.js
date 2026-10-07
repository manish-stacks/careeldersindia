const mongoose = require('mongoose');
const { FAMILY_PERMISSIONS } = require('../config/constants');

// Many users ↔ many parents. The parent creator gets an ACTIVE row with all permissions.
const familyMemberSchema = new mongoose.Schema(
  {
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    invitedEmail: { type: String, lowercase: true, trim: true },
    relation: { type: String, trim: true },
    permissions: [{ type: String, enum: Object.values(FAMILY_PERMISSIONS) }],
    isOwner: { type: Boolean, default: false },
    status: { type: String, enum: ['ACTIVE', 'INVITED', 'REVOKED'], default: 'ACTIVE' },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

familyMemberSchema.index({ parentId: 1, userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } });
familyMemberSchema.index({ userId: 1, status: 1 });
familyMemberSchema.index({ invitedEmail: 1, status: 1 });

module.exports = mongoose.model('FamilyMember', familyMemberSchema);
