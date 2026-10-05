const mongoose = require('mongoose');

const EXPENSE_CATEGORIES = [
  'Rent', 'Electricity', 'Water', 'Salaries', 'Internet / Phone', 'Maintenance / Repairs',
  'Transport / Delivery', 'Cleaning / Supplies', 'Stationery / Printing', 'Taxes / Licenses', 'Other'
];
const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'Bank transfer', 'Cheque', 'Other'];
const PAYMENT_STATUSES = ['Unpaid', 'Paid', 'Received', 'Not received'];

// One expense line entered by a store. CE (executive officer) checks it.
const storeExpenseSchema = new mongoose.Schema({
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  storeCode: String,
  storeName: String,
  month: { type: String, required: true }, // YYYY-MM, from expenseDate
  expenseDate: { type: Date, required: true },
  category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
  amount: { type: Number, required: true, min: 0 },
  paymentMode: { type: String, enum: PAYMENT_MODES, default: 'Cash' },
  paidTo: String,
  billNumber: String,
  description: String,
  addedBy: String,
  addedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastEditedBy: String,
  status: { type: String, enum: ['Pending', 'Checked'], default: 'Pending' },
  checkedBy: String,
  checkedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  checkedAt: Date,
  checkNote: String,
  // Reimbursement: CE marks checked expenses as paid, the store confirms it got the money
  paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'Unpaid' },
  paidBy: String,
  paidById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  paidAt: Date,
  payoutMode: String,
  payoutReference: String,
  payoutNote: String,
  receiptBy: String,
  receiptById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receiptAt: Date,
  receiptNote: String
}, { timestamps: true });

storeExpenseSchema.index({ storeId: 1, month: 1 });
storeExpenseSchema.index({ month: 1 });

const StoreExpense = mongoose.model('StoreExpense', storeExpenseSchema);

module.exports = StoreExpense;
module.exports.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;
module.exports.PAYMENT_MODES = PAYMENT_MODES;
module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
