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
  expectedDate: { type: Date },
  // Two-step approval: store -> executive officer -> main branch.
  // PENDING_EXECUTIVE / REJECTED_BY_EXECUTIVE are hidden from the main branch; missing = FORWARDED (older requests).
  approvalStage: { type: String, enum: ['PENDING_EXECUTIVE', 'REJECTED_BY_EXECUTIVE', 'FORWARDED'], default: 'FORWARDED' },
  executiveReview: {
    decision: { type: String, enum: ['Approved', 'Rejected'] },
    note: { type: String, default: '' },
    by: { type: String },
    byId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date }
  },
  raisedBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    name: { type: String }
  },
  lastUpdatedBy: { type: String },
  // Who did what, oldest first (created, executive decision, every main-branch update)
  actionLog: [{
    action: { type: String },
    status: { type: String },
    note: { type: String, default: '' },
    by: { type: String },
    byId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String },
    createdAt: { type: Date, default: Date.now }
  }],
  // Every main-branch status / response update, oldest first
  mainBranchResponseHistory: [{
    status: { type: String },
    message: { type: String, default: '' },
    expectedDate: { type: Date },
    by: { type: String },
    byId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }],
  // Store's own follow-up after the main branch responds (e.g. "customer informed")
  storeResponse: { type: String, default: '' },
  storeResponseBy: { type: String, default: '' },
  storeResponseAt: { type: Date },
  storeResponseHistory: [{
    message: { type: String, required: true },
    employeeName: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

medicineRequestSchema.pre('save', function () {
  if (this.productName && !this.medicineName) {
    this.medicineName = this.productName;
  } else if (this.medicineName && !this.productName) {
    this.productName = this.medicineName;
  }
});

module.exports = mongoose.model('MedicineRequest', medicineRequestSchema);
