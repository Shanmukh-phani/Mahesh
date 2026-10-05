const mongoose = require('mongoose');
const UserSession = require('../models/UserSession');
const { logActivity, sanitize } = require('../utils/activity');

// Logs every create / update / delete call after it finishes: who, what, which store, and a field-level before → after diff.

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Routes that write their own, richer log rows
const SELF_LOGGED = [/^\/api\/auth\/(login|logout)$/, /^\/api\/activity(\/|$)/];

const IGNORED_FIELDS = new Set([
  '_id', '__v', 'createdAt', 'updatedAt', 'passwordHash', 'actionLog', 'mainBranchResponseHistory',
  'storeResponseHistory', 'responseHistory', 'readBy', 'lastUpdatedBy', 'lastLoginAt'
]);

const M = (name) => () => mongoose.model(name);

const label = {
  MedicineRequest: (d) => d && `${d.requestId || ''} ${d.productName || d.medicineName || ''}`.trim(),
  Employee: (d) => d && `${d.employeeName || ''}${d.employeeId ? ` (${d.employeeId})` : ''}`,
  Store: (d) => d && `${d.storeCode || ''} — ${d.storeName || ''}`,
  User: (d) => d && `${d.name || d.username || ''}${d.username && d.name ? ` (${d.username})` : ''}`,
  Complaint: (d) => d && `${d.complaintId || ''} ${d.medicineName || ''}`.trim(),
  Customer: (d) => d && `${d.name || ''}${d.phone ? ` (${d.phone})` : ''}`,
  MainInventory: (d) => d && `${d.medicineId?.name || 'Medicine'}${d.batchNumber ? ` · batch ${d.batchNumber}` : ''}`,
  Medicine: (d) => d && d.name,
  Notification: (d) => d && d.title,
  StoreExpense: (d) => d && `${d.storeCode || ''} ${d.category || ''} ₹${d.amount ?? ''}`.trim(),
};

const ROLE_NAMES = { ADMIN: 'admin', EXECUTIVE: 'executive officer', MINI_STORE: 'store' };

/**
 * method + path pattern → how to describe it.
 * model / populate: loaded before and after the call to compute the diff.
 * storeFrom: where the related store comes from ('doc' = record.storeId, 'self' = the Store itself, 'param' = :storeId).
 */
const RULES = [
  // Medicine requests
  { m: 'POST', p: '/api/requests', category: 'REQUEST', action: 'REQUEST_CREATED', entity: 'MedicineRequest', storeFrom: 'result',
    describe: ({ result: r }) => `Raised request ${r?.requestId || ''} for ${r?.quantity || '?'} × ${r?.productName || r?.medicineName || 'medicine'}${r?.customerName ? ` (customer ${r.customerName})` : ''}` },
  { m: 'PUT', p: '/api/requests/:id/status', category: 'REQUEST', action: 'REQUEST_STATUS_UPDATED', entity: 'MedicineRequest', model: 'MedicineRequest', storeFrom: 'doc',
    describe: ({ before: b, after: a }) => `Updated ${a?.requestId || b?.requestId || 'request'}: ${b?.status || '?'} → ${a?.status || '?'}` },
  { m: 'PUT', p: '/api/requests/:id/executive-review', category: 'REQUEST', entity: 'MedicineRequest', model: 'MedicineRequest', storeFrom: 'doc',
    action: ({ body }) => (body?.decision === 'reject' ? 'EXECUTIVE_REJECTED' : 'EXECUTIVE_APPROVED'),
    describe: ({ body, after: a }) => `${body?.decision === 'reject' ? 'Rejected' : 'Approved and sent to main branch'} ${a?.requestId || 'request'}${body?.note ? `: "${String(body.note).slice(0, 120)}"` : ''}` },
  { m: 'PUT', p: '/api/requests/:id/store-response', category: 'REQUEST', action: 'STORE_UPDATE_ADDED', entity: 'MedicineRequest', model: 'MedicineRequest', storeFrom: 'doc',
    describe: ({ body, after: a }) => `Added customer update on ${a?.requestId || 'request'}${body?.message ? `: "${String(body.message).slice(0, 120)}"` : ''}` },

  // Complaints
  { m: 'POST', p: '/api/complaints', category: 'COMPLAINT', action: 'COMPLAINT_CREATED', entity: 'Complaint', storeFrom: 'result',
    describe: ({ result: r }) => `Recorded complaint ${r?.complaintId || ''} (${r?.complaintType || 'complaint'}) for ${r?.medicineName || 'medicine'}` },
  { m: 'PUT', p: '/api/complaints/:id/response', category: 'COMPLAINT', action: 'COMPLAINT_RESPONDED', entity: 'Complaint', model: 'Complaint', storeFrom: 'doc',
    describe: ({ before: b, after: a }) => `Responded to complaint ${a?.complaintId || ''}: ${b?.status || '?'} → ${a?.status || '?'}` },
  { m: 'PUT', p: '/api/complaints/:id', category: 'COMPLAINT', action: 'COMPLAINT_UPDATED', entity: 'Complaint', model: 'Complaint', storeFrom: 'doc',
    describe: ({ after: a }) => `Edited complaint ${a?.complaintId || ''}` },
  { m: 'DELETE', p: '/api/complaints/:id', category: 'COMPLAINT', action: 'COMPLAINT_DELETED', entity: 'Complaint', model: 'Complaint', storeFrom: 'doc',
    describe: ({ before: b }) => `Deleted complaint ${b?.complaintId || ''}` },

  // Stores
  { m: 'POST', p: '/api/stores', category: 'STORE', action: 'STORE_CREATED', entity: 'Store', storeFrom: 'resultStore',
    describe: ({ result: r }) => `Created store ${r?.store?.storeCode || ''} — ${r?.store?.storeName || ''}${r?.user?.username ? ` (manager login ${r.user.username})` : ''}` },
  { m: 'PUT', p: '/api/stores/:id', category: 'STORE', action: 'STORE_UPDATED', entity: 'Store', model: 'Store', storeFrom: 'self',
    describe: ({ before: b, after: a }) => (b?.status !== a?.status && a?.status
      ? `${a.status === 'Active' ? 'Activated' : 'Deactivated'} store ${a.storeCode}`
      : `Edited store ${a?.storeCode || b?.storeCode || ''}`) },
  { m: 'DELETE', p: '/api/stores/:id', category: 'STORE', action: 'STORE_DELETED', entity: 'Store', model: 'Store', storeFrom: 'self',
    describe: ({ before: b }) => `Deleted store ${b?.storeCode || ''} — ${b?.storeName || ''} (with its logins, employees and shelf stock)` },

  // Employees
  { m: 'POST', p: '/api/employees/store/:storeId', category: 'EMPLOYEE', action: 'EMPLOYEE_CREATED', entity: 'Employee', storeFrom: 'param',
    describe: ({ result: r, body }) => `Added employee ${r?.employeeName || body?.employeeName || ''}${r?.employeeId ? ` (${r.employeeId})` : ''}${body?.username ? ` with login ${body.username}` : ''}` },
  { m: 'PUT', p: '/api/employees/:id/status', category: 'EMPLOYEE', action: 'EMPLOYEE_STATUS_CHANGED', entity: 'Employee', model: 'Employee', storeFrom: 'doc',
    describe: ({ after: a }) => `${a?.status === 'Active' ? 'Activated' : 'Deactivated'} employee ${a?.employeeName || ''}` },
  { m: 'PUT', p: '/api/employees/:id', category: 'EMPLOYEE', action: 'EMPLOYEE_UPDATED', entity: 'Employee', model: 'Employee', storeFrom: 'doc',
    describe: ({ after: a, body }) => `Edited employee ${a?.employeeName || ''}${body?.password ? ' (login password reset)' : ''}` },
  { m: 'DELETE', p: '/api/employees/:id', category: 'EMPLOYEE', action: 'EMPLOYEE_DELETED', entity: 'Employee', model: 'Employee', storeFrom: 'doc',
    describe: ({ before: b }) => `Deleted employee ${b?.employeeName || ''}${b?.employeeId ? ` (${b.employeeId})` : ''}` },

  // Admin / executive logins
  { m: 'POST', p: '/api/users', category: 'USER', action: 'USER_CREATED', entity: 'User',
    describe: ({ result: r, body }) => `Created ${ROLE_NAMES[r?.role || body?.role] || 'user'} login ${r?.username || body?.username || ''}` },
  { m: 'PUT', p: '/api/users/:id', category: 'USER', action: 'USER_UPDATED', entity: 'User', model: 'User',
    describe: ({ before: b, after: a, body }) => {
      const who = `${ROLE_NAMES[a?.role || b?.role] || 'user'} ${a?.username || b?.username || ''}`;
      if (b && a && b.isActive !== a.isActive) return `${a.isActive ? 'Enabled' : 'Disabled'} ${who}`;
      if (body?.password) return `Reset password for ${who}`;
      if (body?.storeIds) return `Changed store assignment for ${who}`;
      return `Edited ${who}`;
    } },
  { m: 'DELETE', p: '/api/users/:id', category: 'USER', action: 'USER_DELETED', entity: 'User', model: 'User',
    describe: ({ before: b }) => `Deleted ${ROLE_NAMES[b?.role] || 'user'} login ${b?.username || ''}` },
  { m: 'PUT', p: '/api/auth/change-password', category: 'AUTH', action: 'PASSWORD_CHANGED', describe: () => 'Changed own password' },

  // Inventory
  { m: 'PUT', p: '/api/inventory/main/:id', category: 'INVENTORY', action: 'WAREHOUSE_STOCK_UPDATED', entity: 'MainInventory', model: 'MainInventory', populate: 'medicineId',
    describe: ({ before: b, after: a }) => `Updated warehouse stock of ${a?.medicineId?.name || b?.medicineId?.name || 'medicine'}: ${b?.quantity ?? '?'} → ${a?.quantity ?? '?'}` },
  { m: 'POST', p: '/api/inventory/main/add-medicine', category: 'INVENTORY', action: 'WAREHOUSE_MEDICINE_ADDED', entity: 'MainInventory',
    describe: ({ body }) => `Added ${body?.name || 'medicine'} to warehouse${body?.quantity !== undefined ? ` (qty ${body.quantity})` : ''}` },
  { m: 'POST', p: '/api/inventory/main/bulk', category: 'INVENTORY', action: 'WAREHOUSE_BULK_IMPORT',
    describe: ({ result: r, body }) => `Imported warehouse stock from Excel: ${r?.total ?? body?.rows?.length ?? 0} rows (${r?.created ?? 0} new, ${r?.updated ?? 0} updated, ${r?.skipped?.length ?? 0} skipped)` },
  { m: 'POST', p: '/api/inventory/store/bulk', category: 'INVENTORY', action: 'SHELF_BULK_IMPORT',
    describe: ({ result: r, body }) => `Imported shelf stock from Excel: ${r?.total ?? body?.rows?.length ?? 0} rows (${r?.created ?? 0} new, ${r?.updated ?? 0} updated, ${r?.skipped?.length ?? 0} skipped)` },
  { m: 'POST', p: '/api/inventory/store', category: 'INVENTORY', action: 'SHELF_STOCK_UPDATED', entity: 'StoreInventory',
    describe: ({ body }) => `Updated shelf stock${body?.quantity !== undefined ? ` to qty ${body.quantity}` : ''}${body?.batchNumber ? ` (batch ${body.batchNumber})` : ''}` },

  // Catalog / customers
  { m: 'POST', p: '/api/medicines', category: 'MEDICINE', action: 'MEDICINE_CREATED', entity: 'Medicine',
    describe: ({ result: r, body }) => `Added medicine ${r?.name || body?.name || ''} to catalog` },
  { m: 'POST', p: '/api/customers', category: 'CUSTOMER', action: 'CUSTOMER_CREATED', entity: 'Customer',
    describe: ({ result: r, body }) => `Added customer ${r?.name || body?.name || ''} (${r?.phone || body?.phone || ''})` },
  { m: 'PUT', p: '/api/customers/:id', category: 'CUSTOMER', action: 'CUSTOMER_UPDATED', entity: 'Customer', model: 'Customer',
    describe: ({ after: a }) => `Edited customer ${a?.name || ''} (${a?.phone || ''})` },

  // Store expenses
  { m: 'POST', p: '/api/expenses', category: 'EXPENSE', action: 'EXPENSE_ADDED', entity: 'StoreExpense', storeFrom: 'result',
    describe: ({ result: r }) => `Added ${r?.category || ''} expense of ₹${r?.amount ?? '?'} for ${r?.month || ''}` },
  { m: 'PUT', p: '/api/expenses/check-month', category: 'EXPENSE', action: 'EXPENSES_CHECKED', storeFrom: 'body',
    describe: ({ result: r, body }) => `Checked ${r?.checked ?? 0} expense(s) for ${body?.month || ''}` },
  { m: 'PUT', p: '/api/expenses/pay-month', category: 'EXPENSE', action: 'EXPENSES_PAID', storeFrom: 'body',
    describe: ({ result: r, body }) => `Paid ₹${r?.total ?? '?'} for ${r?.paid ?? 0} expense(s) of ${body?.month || ''} (${body?.payoutMode || 'Cash'}${body?.payoutReference ? `, ref ${body.payoutReference}` : ''})` },
  { m: 'PUT', p: '/api/expenses/confirm-payment', category: 'EXPENSE',
    action: ({ body }) => (body?.received === false ? 'EXPENSE_PAYMENT_NOT_RECEIVED' : 'EXPENSE_PAYMENT_RECEIVED'),
    describe: ({ result: r, body }) => (body?.received === false
      ? `Reported ${body?.month || ''} expense payment (₹${r?.total ?? '?'}) as NOT received${body?.note ? `: ${body.note}` : ''}`
      : `Confirmed receiving ₹${r?.total ?? '?'} for ${body?.month || ''} expenses`) },
  { m: 'POST', p: '/api/expenses/remind', category: 'EXPENSE', action: 'EXPENSE_REMINDER_SENT', storeFrom: 'body',
    describe: ({ result: r, body }) => `Reminded ${r?.storeCode || 'store'} to add expenses for ${body?.month || 'this month'}` },
  { m: 'PUT', p: '/api/expenses/:id/check', category: 'EXPENSE', entity: 'StoreExpense', model: 'StoreExpense', storeFrom: 'doc',
    action: ({ body }) => (body?.checked === false ? 'EXPENSE_UNCHECKED' : 'EXPENSE_CHECKED'),
    describe: ({ body, after: a }) => `${body?.checked === false ? 'Un-checked' : 'Checked'} ${a?.storeCode || ''} ${a?.category || ''} expense of ₹${a?.amount ?? '?'}` },
  { m: 'PUT', p: '/api/expenses/:id', category: 'EXPENSE', action: 'EXPENSE_UPDATED', entity: 'StoreExpense', model: 'StoreExpense', storeFrom: 'doc',
    describe: ({ after: a }) => `Edited ${a?.category || ''} expense (₹${a?.amount ?? '?'})` },
  { m: 'DELETE', p: '/api/expenses/:id', category: 'EXPENSE', action: 'EXPENSE_DELETED', entity: 'StoreExpense', model: 'StoreExpense', storeFrom: 'doc',
    describe: ({ before: b }) => `Deleted ${b?.category || ''} expense of ₹${b?.amount ?? '?'} (${b?.month || ''})` },

  // Notifications
  { m: 'POST', p: '/api/notifications/broadcast', category: 'NOTIFICATION', action: 'BROADCAST_SENT', entity: 'Notification',
    describe: ({ result: r, body }) => `Broadcast "${r?.title || body?.title || ''}" to ${r?.targetStoreCodes?.length ? r.targetStoreCodes.join(', ') : r?.storeCode || (body?.targetStoreId ? 'one store' : 'all stores')}` },
  { m: 'PUT', p: '/api/notifications/read-all', category: 'NOTIFICATION', action: 'NOTIFICATIONS_READ_ALL', describe: () => 'Marked all notifications as read' },
  { m: 'PUT', p: '/api/notifications/:id/read', category: 'NOTIFICATION', action: 'NOTIFICATION_READ', entity: 'Notification',
    describe: ({ result: r }) => `Read notification "${r?.title || ''}"` }
].map((r) => ({
  ...r,
  re: new RegExp(`^${r.p.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`)
}));

const findRule = (method, path) => {
  for (const rule of RULES) {
    if (rule.m !== method) continue;
    const match = rule.re.exec(path);
    if (match) return { rule, params: match.groups || {} };
  }
  return null;
};

const loadDoc = async (rule, id) => {
  if (!rule.model || !id || !mongoose.isValidObjectId(id)) return null;
  let q = M(rule.model)().findById(id);
  if (rule.populate) q = q.populate(rule.populate, 'name');
  return q.lean().catch(() => null);
};

const normalize = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v.toISOString();
  if (v instanceof mongoose.Types.ObjectId) return String(v);
  if (typeof v === 'object' && v._id && v.name) return v.name; // populated ref
  if (Array.isArray(v)) return v.map(normalize);
  return v;
};

const flatten = (doc, prefix = '', out = {}) => {
  Object.keys(doc || {}).forEach((k) => {
    if (IGNORED_FIELDS.has(k)) return;
    const v = doc[k];
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof mongoose.Types.ObjectId) && !(v._id && v.name) && !prefix) {
      flatten(v, key, out);
    } else {
      out[key] = normalize(v);
    }
  });
  return out;
};

const shorten = (v) => {
  if (v === null || v === undefined) return v;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 200 ? `${s.slice(0, 200)}…` : (typeof v === 'string' ? v : v);
};

const diff = (before, after) => {
  if (!before || !after) return [];
  const a = flatten(before);
  const b = flatten(after);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changes = [];
  keys.forEach((k) => {
    if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) {
      changes.push({ field: k, from: shorten(a[k] ?? null), to: shorten(b[k] ?? null) });
    }
  });
  return changes.slice(0, 40);
};

const storeIdFor = (rule, { params, before, after, result, user, body }) => {
  if (user?.role === 'MINI_STORE') return user.storeId;
  const pick = (d) => d?.storeId?._id || d?.storeId;
  switch (rule?.storeFrom) {
    case 'param': return params.storeId;
    case 'self': return params.id;
    case 'doc': return pick(after) || pick(before);
    case 'result': return pick(result);
    case 'resultStore': return result?.store?._id;
    case 'body': return body?.storeId;
    default: return pick(after) || pick(before) || pick(result);
  }
};

const activityLogger = async (req, res, next) => {
  const path = (req.originalUrl || req.url || '').split('?')[0].replace(/\/+$/, '') || '/';
  if (!MUTATING.has(req.method) || !path.startsWith('/api/') || SELF_LOGGED.some((re) => re.test(path))) return next();

  const startedAt = Date.now();
  const found = findRule(req.method, path);
  const rule = found?.rule;
  const params = found?.params || {};
  const id = params.id;

  let before = null;
  if (rule?.model && id && req.method !== 'POST') {
    before = await loadDoc(rule, id);
  }

  let captured;
  const originalSend = res.send.bind(res);
  res.send = (body) => {
    if (captured === undefined) {
      if (body && typeof body === 'object' && !Buffer.isBuffer(body)) captured = body;
      else if (typeof body === 'string') {
        try { captured = JSON.parse(body); } catch { captured = null; }
      }
    }
    return originalSend(body);
  };

  res.on('finish', async () => {
    try {
      const user = req.user;
      if (!user) return; // unauthenticated calls (expired tokens etc.) are not attributed to anyone
      const ok = res.statusCode < 400;
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const result = ok ? captured : null;

      const after = ok && rule?.model && id && req.method !== 'DELETE' ? await loadDoc(rule, id) : null;
      const ctx = { body, result, before, after, params, user };

      const action = typeof rule?.action === 'function' ? rule.action(ctx) : (rule?.action || `${req.method}_${path.split('/')[2] || 'API'}`.toUpperCase());
      // a failed call has no result / after state: describe it from what was sent and the record as it was
      const describeCtx = ok ? ctx : { ...ctx, result: body, after: before };
      let summary = rule?.describe ? rule.describe(describeCtx) : `${req.method} ${path}`;
      if (!ok) summary = `Tried to: ${summary}`;

      const changes = ok ? diff(before, after) : [];
      if (ok && body.password && rule?.model && ['User', 'Employee'].includes(rule.model)) {
        changes.push({ field: 'password', from: '••••••', to: '(reset)' });
      }

      const doc = after || before || (result && typeof result === 'object' ? (result.store || result) : null);
      const entityId = id || (doc?._id ? String(doc._id) : undefined);
      const entityLabel = rule?.entity && label[rule.entity] ? label[rule.entity](doc) : undefined;

      logActivity({
        user,
        req,
        storeId: storeIdFor(rule, ctx),
        category: rule?.category || (path.split('/')[2] || 'API').toUpperCase(),
        action,
        outcome: ok ? 'SUCCESS' : 'FAILED',
        summary,
        entity: rule?.entity,
        entityId,
        entityLabel: entityLabel || undefined,
        changes,
        details: Object.keys(body).length ? { input: sanitize(body) } : undefined,
        method: req.method,
        path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
        errorMessage: !ok ? (captured?.error || captured?.message || undefined) : undefined
      });

      if (ok && user.sid && mongoose.isValidObjectId(String(user.sid))) {
        UserSession.updateOne({ _id: user.sid }, { $inc: { actions: 1 } }).catch(() => {});
      }
    } catch (err) {
      console.error('[activity] logger error:', err.message);
    }
  });

  next();
};

module.exports = activityLogger;
