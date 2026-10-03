const mongoose = require('mongoose');

const medicineRequestSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  storeCode: { type: String },
  employeeName: { type: String, required: true },
  productName: { type: String, required: true },
  medicineName: { type: String }, // alias for backward compatibility
  composition: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 1 },
  customer: {
    name: { type: String, required: true },
    address: { type: String, default: '' },
    phone: { type: String, required: true },
    email: { type: String, default: '' }
  },
  comments: { type: String, default: '' },
  mainBranchResponse: { type: String, default: '' },
  adminNotes: { type: String, default: '' },
  status: {
    type: String,
    enum: [
      'Pending',
      'Available at Main Branch',
      'Approved / Will Be Supplied',
      'Ordered',
      'Completed',
      'Not Available',
      'Rejected'
    ],
    default: 'Pending'
  },
  expectedDate: { type: Date }
}, { timestamps: true });

medicineRequestSchema.pre('save', function () {
  if (this.productName && !this.medicineName) {
    this.medicineName = this.productName;
  } else if (this.medicineName && !this.productName) {
    this.productName = this.medicineName;
  }
});

module.exports = mongoose.model('MedicineRequest', medicineRequestSchema);
