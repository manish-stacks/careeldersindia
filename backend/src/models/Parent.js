const mongoose = require('mongoose');
const { ageFromDob } = require('../utils/time');

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true },
    landmark: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true, match: /^[1-9][0-9]{5}$/ },
  },
  { _id: false }
);

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    dosage: { type: String, trim: true },
    schedule: {
      morning: { type: Boolean, default: false },
      afternoon: { type: Boolean, default: false },
      evening: { type: Boolean, default: false },
      night: { type: Boolean, default: false },
    },
    notes: { type: String, trim: true },
  },
  { _id: true }
);

const emergencyContactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    relation: { type: String, trim: true },
    mobile: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const parentSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fullName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'], required: true },
    dateOfBirth: { type: Date, required: true },
    relationToOwner: { type: String, trim: true }, // Mother / Father / Grandparent...
    mobile: { type: String, trim: true },
    photoMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media' },
    address: { type: addressSchema, required: true },
    location: {
      type: { type: String, enum: ['Point'] }, // no default: a location without coordinates breaks the 2dsphere index
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },
    timezone: { type: String, default: 'Asia/Kolkata' },
    bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'], default: 'UNKNOWN' },
    medicalConditions: [{ type: String, trim: true }],
    medicines: [medicineSchema],
    allergies: [{ type: String, trim: true }],
    emergencyContacts: [emergencyContactSchema],
    specialInstructions: { type: String, trim: true, maxlength: 2000 },
    status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
    lastVisitAt: Date,
    lastOverallStatus: { type: String, enum: ['STABLE', 'NEEDS_ATTENTION', 'URGENT_ATTENTION'] },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

parentSchema.virtual('age').get(function age() {
  return ageFromDob(this.dateOfBirth);
});

parentSchema.index({ ownerId: 1, status: 1 });
parentSchema.index({ location: '2dsphere' }, { sparse: true });
parentSchema.index({ 'address.pincode': 1 });

module.exports = mongoose.model('Parent', parentSchema);