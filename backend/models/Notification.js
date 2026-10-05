const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Null for all admins
  recipientRole: { type: String, enum: ['ADMIN', 'EXECUTIVE', 'MINI_STORE'] },
  recipientStoreId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' }, // For routing to specific store users
  type: { type: String },
  title: { type: String, required: true },
  message: { type: String, required: true },
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicineRequest' },
  // Denormalized context so live toasts can show it without extra lookups
  requestCode: { type: String },
  storeCode: { type: String },
  storeName: { type: String },
  productName: { type: String },
  isRead: { type: Boolean, default: false },
  // Per-reader read state for notifications shared by many readers (e.g. broadcasts to all stores).
  // Holds store ids for MINI_STORE readers and 'ADMIN' for the main branch.
  readBy: { type: [String], default: [] },
  // Broadcast sent to several chosen stores: one copy per store, all sharing this id
  broadcastGroup: { type: String },
  targetStoreCodes: { type: [String], default: undefined },
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
