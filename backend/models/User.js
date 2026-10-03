const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['ADMIN', 'MINI_STORE'], required: true },
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' }, // Null for ADMIN
  name: { type: String },
  email: { type: String },
  phone: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
