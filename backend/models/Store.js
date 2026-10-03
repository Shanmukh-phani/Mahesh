const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
  storeCode: { type: String, required: true, unique: true }, // Store ID / Login ID
  storeName: { type: String, required: true },
  location: { type: String }, // Store Address
  phone: { type: String }, // Store Phone
  email: { type: String }, // Store Email
  contactPerson: { type: String }, // Manager Name
  managerPhone: { type: String }, // Manager Phone
  managerEmail: { type: String }, // Manager Email
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Sync isActive with status pre-save
storeSchema.pre('save', function () {
  if (this.status) {
    this.isActive = this.status === 'Active';
  } else if (this.isActive !== undefined) {
    this.status = this.isActive ? 'Active' : 'Inactive';
  }
});

module.exports = mongoose.model('Store', storeSchema);
