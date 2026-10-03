const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String },
  address: { type: String },
  totalRequests: { type: Number, default: 0 },
  preferredStore: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  notes: { type: String },
  status: { type: String, enum: ['Active', 'VIP', 'Inactive'], default: 'Active' }
}, { timestamps: true });

module.exports = mongoose.model('Customer', customerSchema);
