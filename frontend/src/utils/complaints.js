import { excelDate, excelDay } from './exportExcel';

export const COMPLAINT_TYPES = ['Not Working / Ineffective', 'Price Issue', 'Damaged / Expired', 'Side Effect / Reaction', 'Other'];
export const COMPLAINT_STATUSES = ['Open', 'In Review', 'Resolved', 'Rejected'];

export const COMPLAINT_STATUS_STYLE = {
  Open: { bgcolor: '#FEF3C7', color: '#92400E' },
  'In Review': { bgcolor: '#DBEAFE', color: '#1D4ED8' },
  Resolved: { bgcolor: '#DCFCE7', color: '#166534' },
  Rejected: { bgcolor: '#FEE2E2', color: '#991B1B' }
};

export const COMPLAINT_TYPE_STYLE = {
  'Price Issue': { bgcolor: '#EDE9FE', color: '#5B21B6' },
  'Not Working / Ineffective': { bgcolor: '#FFE4E6', color: '#9F1239' },
  'Damaged / Expired': { bgcolor: '#FFEDD5', color: '#9A3412' },
  'Side Effect / Reaction': { bgcolor: '#FCE7F3', color: '#9D174D' },
  Other: { bgcolor: '#F1F5F9', color: '#334155' }
};

export const complaintStoreCode = (c) => c?.storeCode || c?.storeId?.storeCode || '';
export const complaintStoreName = (c) => c?.storeName || c?.storeId?.storeName || '';

export const complaintSearchText = (c) => [
  c.complaintId, complaintStoreCode(c), complaintStoreName(c), c.customerName, c.customerPhone,
  c.medicineName, c.medicineBrand, c.batchNumber, c.composition, c.complaintType, c.complaintText,
  c.employeeName, c.adminResponse, c.status
].map((v) => String(v || '').toLowerCase()).join(' ');

export const complaintExcelRow = (c) => ({
  'Complaint ID': c.complaintId,
  'Store Code': complaintStoreCode(c),
  'Store Name': complaintStoreName(c),
  'Complaint Date': excelDay(c.complaintDate || c.createdAt),
  'Customer Name': c.customerName || '',
  'Customer Phone': c.customerPhone || '',
  'Medicine Name': c.medicineName || '',
  'Medicine Brand': c.medicineBrand || '',
  'Batch Number': c.batchNumber || '',
  Composition: c.composition || '',
  'Purchase Date': excelDay(c.purchaseDate),
  'Quantity Bought': c.quantityBought ?? '',
  'Complaint Type': c.complaintType || '',
  'Price Paid': c.pricePaid ?? '',
  'Expected Price': c.expectedPrice ?? '',
  Complaint: c.complaintText || '',
  'Entered By': c.employeeName || '',
  'Entered At': excelDate(c.createdAt),
  Status: c.status || '',
  'Main Branch Response': c.adminResponse || '',
  'Response At': excelDate(c.adminResponseAt)
});
