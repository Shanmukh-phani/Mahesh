const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  // ADMIN = main branch (main admin + mini admins), EXECUTIVE = executive officer over assigned stores,
  // MINI_STORE = an individual store employee login
  role: { type: String, enum: ['ADMIN', 'EXECUTIVE', 'MINI_STORE'], required: true },
  // Only for ADMIN: MAIN can manage other admins, SUB (mini admin) has every other admin power
  adminLevel: { type: String, enum: ['MAIN', 'SUB'] },
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' }, // MINI_STORE only
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }, // MINI_STORE only: the person behind this login
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String },
  email: { type: String },
  phone: { type: String },
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
