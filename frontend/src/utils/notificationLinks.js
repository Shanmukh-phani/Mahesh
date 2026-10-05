const REQUEST_CODE_RE = /\bMR-\d+\b/i;

// The layout badge and NotificationsPage keep separate lists; this event keeps their read state in sync.
export const NOTIFICATIONS_READ_EVENT = 'medconnect:notifications-read';

export const announceNotificationsRead = (id) =>
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_READ_EVENT, { detail: id ? { id } : { all: true } }));

export const applyReadEvent = (list, detail) =>
  detail?.all
    ? list.map((n) => (n.isRead ? n : { ...n, isRead: true }))
    : list.map((n) => (n._id === detail?.id && !n.isRead ? { ...n, isRead: true } : n));

export const notificationRequestRef = (notif) => {
  const id = notif?.requestId?._id || notif?.requestId;
  if (id) return { key: 'open', value: String(id) };
  const match = `${notif?.message || ''} ${notif?.title || ''}`.match(REQUEST_CODE_RE);
  if (match) return { key: 'code', value: match[0].toUpperCase() };
  return null;
};

// Request ID / store / product for a notification: stored fields first, then the populated request, then the text.
export const notificationContext = (notif) => {
  const req = notif?.requestId && typeof notif.requestId === 'object' ? notif.requestId : null;
  const text = `${notif?.title || ''} ${notif?.message || ''}`;
  const storeFromText = text.match(/Store:\s*([A-Z]{2,}\d{2,})/i)?.[1] || text.match(/\bAP\d{2,3}\b/i)?.[0] || '';
  return {
    requestCode: EXPENSE_TYPES.includes(notif?.type) ? '' : notif?.requestCode || req?.requestId || text.match(REQUEST_CODE_RE)?.[0]?.toUpperCase() || '',
    storeCode: (notif?.storeCode || req?.storeCode || req?.storeId?.storeCode || storeFromText).toUpperCase(),
    storeName: notif?.storeName || req?.storeId?.storeName || '',
    productName: notif?.productName || req?.productName || req?.medicineName || ''
  };
};

const COMPLAINT_TYPES = ['NEW_COMPLAINT', 'COMPLAINT_RESPONSE'];
// requestCode on these holds the month key, e.g. EXP-2026-10-END
const EXPENSE_TYPES = ['EXPENSE_REMINDER', 'EXPENSE_CHECKED', 'EXPENSE_PAID', 'EXPENSE_RECEIPT'];
const expenseMonth = (notif) => String(notif?.requestCode || '').match(/EXP-(\d{4}-\d{2})/)?.[1];
const complaintTarget = (notif, base) => (notif?.requestCode ? `${base}?code=${encodeURIComponent(notif.requestCode)}` : base);

export const notificationTarget = (notif, role) => {
  if (EXPENSE_TYPES.includes(notif?.type)) {
    if (role === 'ADMIN') return '/admin/notifications';
    const month = expenseMonth(notif);
    return `${role === 'EXECUTIVE' ? '/executive/expenses' : '/store/expenses'}${month ? `?month=${month}` : ''}`;
  }
  if (COMPLAINT_TYPES.includes(notif?.type)) {
    const base = role === 'ADMIN' ? '/admin/complaints' : role === 'EXECUTIVE' ? '/executive/complaints' : '/store/complaints';
    return complaintTarget(notif, base);
  }
  const ref = notificationRequestRef(notif);
  const query = ref ? `?${ref.key}=${encodeURIComponent(ref.value)}` : '';

  if (role === 'EXECUTIVE') {
    if (ref || notif?.type === 'APPROVAL_REQUIRED') return `/executive/approvals${query}`;
    return '/executive/notifications';
  }

  if (role === 'ADMIN') {
    if (notif?.type === 'LOW_STOCK') return '/admin/inventory';
    if (ref || notif?.type === 'NEW_REQUEST') return `/admin/requests${query}`;
    return '/admin/notifications';
  }

  if (ref || notif?.type === 'STATUS_UPDATE') return `/store/requests${query}`;
  return '/store/notifications';
};

export const notificationActionLabel = (notif, role) => {
  if (notif?.type === 'EXPENSE_REMINDER') return 'Add expenses';
  if (notif?.type === 'EXPENSE_CHECKED') return 'View expenses';
  if (notif?.type === 'EXPENSE_PAID') return 'Confirm payment';
  if (notif?.type === 'EXPENSE_RECEIPT') return role === 'ADMIN' ? null : 'View expenses';
  if (notif?.type === 'NEW_COMPLAINT') return 'Review complaint';
  if (notif?.type === 'COMPLAINT_RESPONSE') return 'View complaint';
  if (role === 'EXECUTIVE') {
    if (notif?.type === 'APPROVAL_REQUIRED') return 'Review & approve';
    if (notificationRequestRef(notif)) return 'View request';
    return null;
  }
  if (role === 'ADMIN') {
    if (notif?.type === 'LOW_STOCK') return 'Open inventory';
    if (notif?.type === 'STORE_RESPONSE') return 'View store update';
    if (notificationRequestRef(notif) || notif?.type === 'NEW_REQUEST') return 'Review & approve';
    return null;
  }
  if (notificationRequestRef(notif) || notif?.type === 'STATUS_UPDATE') return 'View request';
  return null;
};

export const findRequestFromParams = (requests, searchParams) => {
  const openId = searchParams.get('open');
  const code = searchParams.get('code');
  if (!openId && !code) return { wanted: false, request: null };
  const request = requests.find((r) =>
    (openId && String(r._id) === openId) ||
    (code && String(r.requestId || '').toUpperCase() === code.toUpperCase())
  ) || null;
  return { wanted: true, request };
};
