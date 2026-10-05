const mongoose = require('mongoose');

const COMPLAINT_TYPES = ['Not Working / Ineffective', 'Price Issue', 'Damaged / Expired', 'Side Effect / Reaction', 'Other'];
const COMPLAINT_STATUSES = ['Open', 'In Review', 'Resolved', 'Rejected'];

const complaintSchema = new mongoose.Schema({
  complaintId: { type: String, required: true, unique: true }, // e.g. CMP-10001
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  storeCode: { type: String },
  storeName: { type: String },

  complaintDate: { type: Date, default: Date.now },
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },

  medicineName: { type: String, required: true },
  medicineBrand: { type: String },
  batchNumber: { type: String },
  composition: { type: String },
  purchaseDate: { type: Date },
  quantityBought: { type: Number, min: 0 },

  complaintType: { type: String, enum: COMPLAINT_TYPES, default: 'Not Working / Ineffective' },
  pricePaid: { type: Number, min: 0 },
  expectedPrice: { type: Number, min: 0 },
  complaintText: { type: String, required: true },
  employeeName: { type: String, required: true },

  status: { type: String, enum: COMPLAINT_STATUSES, default: 'Open' },
  adminResponse: { type: String },
  adminResponseAt: { type: Date },
  adminResponseBy: { type: String },
  enteredByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  responseHistory: [{
    status: { type: String },
    message: { type: String },
    by: { type: String },
    byId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

complaintSchema.statics.TYPES = COMPLAINT_TYPES;
complaintSchema.statics.STATUSES = COMPLAINT_STATUSES;

module.exports = mongoose.model('Complaint', complaintSchema);
