import { format, addMonths, parse } from 'date-fns';
import { excelDate, excelDay } from './exportExcel';

// Fired after the store adds / edits / deletes an expense so the menu badge refreshes
export const EXPENSES_CHANGED_EVENT = 'medconnect:expenses-changed';

export const EXPENSE_CATEGORIES = [
  'Rent', 'Electricity', 'Water', 'Salaries', 'Internet / Phone', 'Maintenance / Repairs',
  'Transport / Delivery', 'Cleaning / Supplies', 'Stationery / Printing', 'Taxes / Licenses', 'Other'
];
export const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'Bank transfer', 'Cheque', 'Other'];

// Reimbursement of checked expenses: CE pays → store confirms
export const PAYMENT_STATUS_META = {
  Unpaid: { label: 'Not paid yet', bg: '#F1F5F9', color: '#475569' },
  Paid: { label: 'Paid · waiting for store', bg: '#DBEAFE', color: '#1D4ED8' },
  Received: { label: 'Payment received', bg: '#DCFCE7', color: '#15803D' },
  'Not received': { label: 'Payment not received', bg: '#FEE2E2', color: '#B91C1C' }
};
export const paymentStatusOf = (e) => e?.paymentStatus || 'Unpaid';

export const CATEGORY_COLORS = {
  Rent: '#7C3AED',
  Electricity: '#D97706',
  Water: '#0284C7',
  Salaries: '#059669',
  'Internet / Phone': '#4F46E5',
  'Maintenance / Repairs': '#DC2626',
  'Transport / Delivery': '#0D9488',
  'Cleaning / Supplies': '#65A30D',
  'Stationery / Printing': '#9333EA',
  'Taxes / Licenses': '#B45309',
  Other: '#64748B'
};

export const currentMonth = () => format(new Date(), 'yyyy-MM');
export const monthToDate = (m) => parse(`${m}-01`, 'yyyy-MM-dd', new Date());
export const shiftMonth = (m, n) => format(addMonths(monthToDate(m), n), 'yyyy-MM');
export const monthLabel = (m) => format(monthToDate(m), 'MMMM yyyy');
export const isValidMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || '');

export const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const expenseExcelRow = (e) => ({
  'Store ID': e.storeCode || '',
  'Store': e.storeName || '',
  'Month': e.month ? monthLabel(e.month) : '',
  'Date': excelDay(e.expenseDate),
  'Category': e.category,
  'Amount (₹)': e.amount,
  'Payment mode': e.paymentMode || '',
  'Paid to': e.paidTo || '',
  'Bill / receipt no.': e.billNumber || '',
  'Description': e.description || '',
  'Added by': e.addedBy || '',
  'Added on': excelDate(e.createdAt),
  'Status': e.status,
  'Checked by': e.checkedBy || '',
  'Checked on': excelDate(e.checkedAt),
  'Check note': e.checkNote || '',
  'Payment': e.status === 'Checked' ? PAYMENT_STATUS_META[paymentStatusOf(e)].label : '',
  'Paid by': e.paidBy || '',
  'Paid on': excelDate(e.paidAt),
  'Paid via': e.payoutMode || '',
  'Payment ref.': e.payoutReference || '',
  'Payment note': e.payoutNote || '',
  'Store confirmation by': e.receiptBy || '',
  'Store confirmed on': excelDate(e.receiptAt),
  'Store confirmation note': e.receiptNote || ''
});

export const categoryTotals = (expenses) => {
  const map = new Map();
  expenses.forEach((e) => map.set(e.category, (map.get(e.category) || 0) + Number(e.amount || 0)));
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
};
