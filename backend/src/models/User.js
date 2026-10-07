const mongoose = require('mongoose');
const { ROLES } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true },
    mobile: { type: String, trim: true },
    country: { type: String, trim: true, default: 'US' },
    timezone: { type: String, default: 'UTC' },
    passwordHash: { type: String, required: true, select: false },
    passwordChangedAt: Date,
    role: { type: String, enum: Object.values(ROLES), required: true, default: ROLES.CUSTOMER },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'DELETED'], default: 'ACTIVE' },
    profileImageMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media' },
    // ADMIN users only. null/undefined = super admin (full access); otherwise limited to the role's permissions.
    adminRole: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ mobile: 1 }, { unique: true, partialFilterExpression: { mobile: { $type: 'string' } } });
userSchema.index({ role: 1, status: 1 });

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
