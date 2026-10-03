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

export const notificationTarget = (notif, role) => {
  const ref = notificationRequestRef(notif);
  const query = ref ? `?${ref.key}=${encodeURIComponent(ref.value)}` : '';

  if (role === 'ADMIN') {
    if (notif?.type === 'LOW_STOCK') return '/admin/inventory';
    if (ref || notif?.type === 'NEW_REQUEST') return `/admin/requests${query}`;
    return '/admin/notifications';
  }

  if (ref || notif?.type === 'STATUS_UPDATE') return `/store/requests${query}`;
  return '/store/notifications';
};

export const notificationActionLabel = (notif, role) => {
  if (role === 'ADMIN') {
    if (notif?.type === 'LOW_STOCK') return 'Open inventory';
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
