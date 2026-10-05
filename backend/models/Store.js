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
  // Executive officer (User with role EXECUTIVE) who reviews this store's requests first
  executiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
