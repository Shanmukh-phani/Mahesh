const mongoose = require('mongoose');

const storeInventorySchema = new mongoose.Schema({
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  quantity: { type: Number, default: 0 },
  batchNumber: { type: String },
  expiryDate: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('StoreInventory', storeInventorySchema);
