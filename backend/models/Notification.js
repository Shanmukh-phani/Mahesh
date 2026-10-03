const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Null for all admins
  recipientRole: { type: String, enum: ['ADMIN', 'MINI_STORE'] },
  recipientStoreId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' }, // For routing to specific store users
  type: { type: String },
  title: { type: String, required: true },
  message: { type: String, required: true },
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicineRequest' },
  isRead: { type: Boolean, default: false },
  // Per-reader read state for notifications shared by many readers (e.g. broadcasts to all stores).
  // Holds store ids for MINI_STORE readers and 'ADMIN' for the main branch.
  readBy: { type: [String], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
