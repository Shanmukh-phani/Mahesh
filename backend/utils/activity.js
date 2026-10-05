const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');
const Store = require('../models/Store');

const serverStartedAt = new Date();

const clientIp = (req) => {
  const fwd = req?.headers?.['x-forwarded-for'];
  const ip = (fwd ? String(fwd).split(',')[0] : req?.ip || req?.socket?.remoteAddress || '').trim();
  return ip.replace(/^::ffff:/, '');
};

// "Chrome on macOS · Desktop"
const describeDevice = (ua = '') => {
  if (!ua) return '';
  if (/python-httpx|aiohttp|python-requests/i.test(ua)) return 'Ask AI assistant';
  let browser = 'Browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  else if (/curl|Postman|axios|node-fetch/i.test(ua)) browser = 'API client';

  let os = '';
  if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPod/.test(ua)) os = 'iPhone';
  else if (/iPad/.test(ua)) os = 'iPad';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  const type = /iPad|Tablet/.test(ua) ? 'Tablet' : /Mobi|Android|iPhone/.test(ua) ? 'Mobile' : 'Desktop';
  return `${browser}${os ? ` on ${os}` : ''} · ${type}`;
};

const requestSource = (req) => (/python-httpx|aiohttp|python-requests/i.test(req?.headers?.['user-agent'] || '') ? 'AI_ASSISTANT' : 'WEB');

const clientInfo = (req) => {
  const userAgent = String(req?.headers?.['user-agent'] || '').slice(0, 300);
  return { ip: clientIp(req), userAgent, device: describeDevice(userAgent) };
};

// Small cache so every log row can carry the store code / name without a lookup each time
const storeCache = new Map();
const STORE_TTL = 5 * 60 * 1000;
const storeMeta = async (storeId) => {
  if (!storeId || !mongoose.isValidObjectId(String(storeId))) return {};
  const key = String(storeId);
  const hit = storeCache.get(key);
  if (hit && Date.now() - hit.t < STORE_TTL) return hit.v;
  const s = await Store.findById(key, 'storeCode storeName').lean().catch(() => null);
  const v = s ? { storeCode: s.storeCode, storeName: s.storeName } : {};
  storeCache.set(key, { t: Date.now(), v });
  return v;
};

// Actor fields from req.user (set by auth middleware) or from a User document
const actorFields = (user) => {
  if (!user) return { actorRole: 'GUEST' };
  return {
    actorId: user._id,
    actorName: user.employeeName || user.name || user.username,
    actorUsername: user.username,
    actorRole: user.role,
    adminLevel: user.role === 'ADMIN' ? (user.adminLevel || 'MAIN') : undefined,
    employeeId: user.employeeId || undefined,
    designation: user.designation || undefined
  };
};

const SECRET_KEY = /pass|token|secret|hash/i;
// Request body copy that is safe to store: no passwords, long arrays collapsed
const sanitize = (value, depth = 0) => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    if (value.length > 10 || depth > 2) return `[${value.length} items]`;
    return value.map((v) => sanitize(v, depth + 1));
  }
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (depth > 2) return '[object]';
    const out = {};
    Object.keys(value).slice(0, 40).forEach((k) => {
      out[k] = SECRET_KEY.test(k) ? (value[k] ? '[hidden]' : value[k]) : sanitize(value[k], depth + 1);
    });
    return out;
  }
  if (typeof value === 'string' && value.length > 300) return `${value.slice(0, 300)}…`;
  return value;
};

/**
 * Write one activity row. Never throws and never blocks the caller.
 * entry: { user, req, category, action, summary, storeId, entity, entityId, entityLabel, changes, details, outcome, ... }
 */
const logActivity = (entry) => {
  (async () => {
    const { user, req, storeId: givenStoreId, ...rest } = entry;
    const storeId = givenStoreId || (user?.role === 'MINI_STORE' ? user.storeId : undefined);
    const meta = await storeMeta(storeId);
    const info = req ? clientInfo(req) : {};
    await ActivityLog.create({
      at: new Date(),
      ...actorFields(user),
      ...(storeId && mongoose.isValidObjectId(String(storeId)) ? { storeId, ...meta } : {}),
      sessionId: user?.sid && mongoose.isValidObjectId(String(user.sid)) ? user.sid : undefined,
      source: req ? requestSource(req) : 'SERVER',
      ...info,
      ...rest
    });
  })().catch((err) => console.error('[activity] failed to write log:', err.message));
};

const formatDuration = (ms) => {
  const totalMin = Math.round((ms || 0) / 60000);
  if (totalMin < 1) return 'under a minute';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
};

module.exports = {
  serverStartedAt, clientIp, clientInfo, describeDevice, requestSource, storeMeta, actorFields, sanitize, logActivity, formatDuration
};
