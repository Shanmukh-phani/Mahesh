const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  employeeId: { type: String, required: true }, // e.g. EMP-MS001-01
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  storeCode: { type: String, required: true },
  employeeName: { type: String, required: true },
  designation: { 
    type: String, 
    enum: ['Store Manager', 'Executive', 'Employee', 'Other'], 
    default: 'Employee' 
  },
  phone: { type: String },
  email: { type: String },
  address: { type: String },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Ensure status & isActive stay in sync
employeeSchema.pre('save', function () {
  if (this.status) {
    this.isActive = this.status === 'Active';
  } else if (this.isActive !== undefined) {
    this.status = this.isActive ? 'Active' : 'Inactive';
  }
});

module.exports = mongoose.model('Employee', employeeSchema);
