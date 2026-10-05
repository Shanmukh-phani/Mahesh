import { format, formatDistanceToNowStrict, startOfDay, endOfDay, subDays } from 'date-fns';
import { excelDate } from '../../utils/exportExcel';

export const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' }
];

export const periodRange = (period) => {
  const now = new Date();
  switch (period) {
    case 'today': return { from: startOfDay(now).toISOString() };
    case 'yesterday': return { from: startOfDay(subDays(now, 1)).toISOString(), to: endOfDay(subDays(now, 1)).toISOString() };
    case '7d': return { from: subDays(now, 7).toISOString() };
    case '30d': return { from: subDays(now, 30).toISOString() };
    default: return { from: new Date(0).toISOString() };
  }
};

export const CATEGORIES = {
  AUTH: { label: 'Sign in / out', color: '#2563EB' },
  SESSION: { label: 'Sessions', color: '#7C3AED' },
  REQUEST: { label: 'Requests', color: '#0D9488' },
  COMPLAINT: { label: 'Complaints', color: '#DC2626' },
  INVENTORY: { label: 'Inventory', color: '#D97706' },
  STORE: { label: 'Stores', color: '#0891B2' },
  EMPLOYEE: { label: 'Employees', color: '#4F46E5' },
  USER: { label: 'Admin / executive logins', color: '#9333EA' },
  CUSTOMER: { label: 'Customers', color: '#059669' },
  MEDICINE: { label: 'Medicines', color: '#65A30D' },
  EXPENSE: { label: 'Store expenses', color: '#EA580C' },
  NOTIFICATION: { label: 'Notifications', color: '#64748B' },
  NAVIGATION: { label: 'Pages opened', color: '#94A3B8' },
  EXPORT: { label: 'Excel downloads', color: '#16A34A' },
  SYSTEM: { label: 'Server', color: '#0F172A' }
};

export const categoryInfo = (c) => CATEGORIES[c] || { label: c || 'Other', color: '#64748B' };

// Quick groups for the activity feed
export const FEED_GROUPS = [
  { value: 'ALL', label: 'Everything' },
  { value: 'CHANGES', label: 'Changes', category: 'REQUEST,COMPLAINT,EXPENSE,INVENTORY,STORE,EMPLOYEE,USER,CUSTOMER,MEDICINE,NOTIFICATION' },
  { value: 'LOGINS', label: 'Sign-ins', category: 'AUTH,SESSION' },
  { value: 'PAGES', label: 'Pages', category: 'NAVIGATION' },
  { value: 'EXPORTS', label: 'Excel', category: 'EXPORT' },
  { value: 'FAILED', label: 'Failed', outcome: 'FAILED' }
];

export const roleLabel = (role, adminLevel, designation) => {
  if (role === 'ADMIN') return adminLevel === 'SUB' ? 'Admin' : 'Main admin';
  if (role === 'EXECUTIVE') return 'Executive officer';
  if (role === 'MINI_STORE') return designation || 'Store staff';
  if (role === 'SYSTEM') return 'System';
  return 'Unknown';
};

export const ROLE_COLORS = {
  ADMIN: { bg: '#CCFBF1', color: '#0F766E' },
  EXECUTIVE: { bg: '#EDE9FE', color: '#6D28D9' },
  MINI_STORE: { bg: '#FFEDD5', color: '#C2410C' },
  SYSTEM: { bg: '#E2E8F0', color: '#0F172A' },
  GUEST: { bg: '#FEE2E2', color: '#B91C1C' }
};

export const SESSION_STATUS = {
  ONLINE: { label: 'Online now', bg: '#DCFCE7', color: '#15803D' },
  CLOSED: { label: 'App closed', bg: '#F1F5F9', color: '#475569' },
  LOGGED_OUT: { label: 'Signed out', bg: '#E0F2FE', color: '#0369A1' },
  ENDED_BY_ADMIN: { label: 'Signed out by admin', bg: '#FEE2E2', color: '#B91C1C' }
};

export const fmtDuration = (ms) => {
  const totalMin = Math.floor((ms || 0) / 60000);
  if (totalMin < 1) return ms > 0 ? '< 1m' : '0m';
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d) return `${d}d ${h}h`;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};

export const fmtTime = (d) => (d ? format(new Date(d), 'dd MMM yyyy, hh:mm a') : '—');
export const fmtShort = (d) => (d ? format(new Date(d), 'dd MMM, hh:mm a') : '—');
export const ago = (d) => (d ? `${formatDistanceToNowStrict(new Date(d))} ago` : '—');

export const fmtValue = (v) => {
  if (v === null || v === undefined || v === '') return '(empty)';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtTime(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

// "contactPerson" → "Contact person", "customer.name" → "Customer name"
export const fieldLabel = (f = '') => {
  const s = String(f).replace(/\./g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/Id$/, '').trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const logExcelRow = (l) => ({
  'Date & time': excelDate(l.at),
  'Who': l.actorName || l.actorUsername || '',
  'Login': l.actorUsername || '',
  'Role': roleLabel(l.actorRole, l.adminLevel, l.designation),
  'Store': l.storeCode ? `${l.storeCode} ${l.storeName || ''}`.trim() : '',
  'Category': categoryInfo(l.category).label,
  'Action': l.action,
  'Result': l.outcome === 'FAILED' ? 'Failed' : 'Success',
  'What happened': l.summary || '',
  'Record': l.entityLabel || '',
  'Changes': (l.changes || []).map((c) => `${fieldLabel(c.field)}: ${fmtValue(c.from)} → ${fmtValue(c.to)}`).join('; '),
  'Error': l.errorMessage || '',
  'Source': l.source === 'AI_ASSISTANT' ? 'Ask AI' : l.source || '',
  'Device': l.device || '',
  'IP address': l.ip || ''
});

export const sessionExcelRow = (s) => ({
  'User': s.name || s.username,
  'Login': s.username,
  'Role': roleLabel(s.role, s.adminLevel),
  'Store': s.storeCode ? `${s.storeCode} ${s.storeName || ''}`.trim() : '',
  'Signed in': excelDate(s.loginAt),
  'Last seen': excelDate(s.lastSeenAt),
  'Signed out': excelDate(s.logoutAt),
  'Status': SESSION_STATUS[s.status]?.label || s.status,
  'Session length': fmtDuration(s.durationMs),
  'Active (app visible)': fmtDuration(s.activeMs),
  'Pages opened': s.pageViews || 0,
  'Changes made': s.actions || 0,
  'Last page': s.lastPath || '',
  'Ended by': s.endedBy || '',
  'Device': s.device || '',
  'IP address': s.ip || ''
});

export const userTimeExcelRow = (u) => ({
  'User': u.name || u.username,
  'Login': u.username,
  'Role': roleLabel(u.role, u.adminLevel),
  'Store': u.storeCode || '',
  'Sessions': u.sessions,
  'Time in app': fmtDuration(u.totalMs),
  'Active time': fmtDuration(u.activeMs),
  'Changes made': u.actions || 0,
  'Pages opened': u.pageViews || 0,
  'Failed attempts': u.failed || 0,
  'Last sign-in': excelDate(u.lastLoginAt),
  'Last seen': excelDate(u.lastSeenAt),
  'Online now': u.online ? 'Yes' : 'No'
});
