const mongoose = require('mongoose');

const mainInventorySchema = new mongoose.Schema({
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  quantity: { type: Number, default: 0 },
  batchNumber: { type: String },
  expiryDate: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('MainInventory', mainInventorySchema);
