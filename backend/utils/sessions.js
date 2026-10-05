const crypto = require('crypto');
const mongoose = require('mongoose');
const UserSession = require('../models/UserSession');
const { clientInfo, storeMeta, logActivity } = require('./activity');

const ONLINE_WINDOW_MS = 3 * 60 * 1000;
const TOUCH_EVERY_MS = 30 * 1000;
const MAX_HEARTBEAT_GAP_MS = 90 * 1000;

const sessionStatus = (s, now = Date.now()) => {
  if (s.logoutAt) return s.endReason === 'FORCED' ? 'ENDED_BY_ADMIN' : 'LOGGED_OUT';
  return now - new Date(s.lastSeenAt).getTime() <= ONLINE_WINDOW_MS ? 'ONLINE' : 'CLOSED';
};

const sessionDurationMs = (s) => {
  // A remotely ended session really stopped at the user's last activity, not when the admin ended it
  const end = s.logoutAt && s.endReason !== 'FORCED' ? new Date(s.logoutAt) : new Date(s.lastSeenAt || s.loginAt);
  return Math.max(0, end - new Date(s.loginAt));
};

const createSession = async (account, req, { startedFrom = 'LOGIN', tokenKey } = {}) => {
  const storeId = account.storeId?._id || account.storeId;
  const meta = await storeMeta(storeId);
  const now = new Date();
  return UserSession.create({
    userId: account._id,
    username: account.username,
    name: account.employeeName || account.name || account.username,
    role: account.role,
    adminLevel: account.role === 'ADMIN' ? (account.adminLevel || 'MAIN') : undefined,
    storeId: storeId || undefined,
    ...meta,
    employeeId: account.employeeId || undefined,
    loginAt: now,
    lastSeenAt: now,
    startedFrom,
    tokenKey,
    ...clientInfo(req)
  });
};

// Tokens issued before session tracking have no sid; key their session by a hash of the token
const legacyKey = (token) => crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 32);
const legacyCache = new Map();

/**
 * Finds (or lazily starts) the session for this request and marks it as seen.
 * Returns the session id, or false when the session was signed out / ended by an admin.
 */
const resolveSession = async ({ decoded, token, account, employee, req }) => {
  const now = Date.now();
  let sid = decoded.sid && mongoose.isValidObjectId(String(decoded.sid)) ? String(decoded.sid) : null;
  let key = null;

  if (!sid) {
    key = legacyKey(token);
    sid = legacyCache.get(key) || null;
    if (!sid) {
      const existing = await UserSession.findOne({ userId: account._id, tokenKey: key }).sort({ loginAt: -1 }).select('_id').lean();
      if (existing) sid = String(existing._id);
    }
  }

  let session = sid ? await UserSession.findById(sid).select('logoutAt lastSeenAt').lean() : null;
  if (session?.logoutAt) return false;

  if (!session) {
    const created = await createSession(
      { ...account, employeeName: employee?.employeeName },
      req,
      { startedFrom: decoded.sid ? 'RESTORED' : 'EXISTING_LOGIN', tokenKey: key || legacyKey(token) }
    );
    session = created.toObject();
    sid = String(created._id);
    logActivity({
      user: { ...account, _id: account._id, employeeName: employee?.employeeName, sid },
      req,
      category: 'SESSION',
      action: 'SESSION_STARTED',
      summary: 'Session picked up from an existing sign-in',
      entity: 'Session',
      entityId: sid
    });
  }
  if (key) legacyCache.set(key, sid);

  if (now - new Date(session.lastSeenAt).getTime() > TOUCH_EVERY_MS) {
    UserSession.updateOne({ _id: sid }, { lastSeenAt: new Date(now) }).catch(() => {});
  }
  return sid;
};

// Heartbeat from an open app tab: counts visible time and remembers the current page
const recordHeartbeat = async (sid, { visible, ending, path }) => {
  const session = await UserSession.findById(sid);
  if (!session || session.logoutAt) return null;
  const now = new Date();
  if (visible && session.lastHeartbeatAt) {
    const gap = now - session.lastHeartbeatAt;
    if (gap > 0) session.activeMs += Math.min(gap, MAX_HEARTBEAT_GAP_MS);
  }
  // ending = the tab is being hidden: count up to now, then stop the clock until it is visible again
  session.lastHeartbeatAt = visible && !ending ? now : undefined;
  session.lastSeenAt = now;
  if (path) session.lastPath = String(path).slice(0, 200);
  await session.save();
  return session;
};

const endSession = async (sid, { reason, endedBy } = {}) => {
  const session = await UserSession.findById(sid);
  if (!session || session.logoutAt) return session;
  session.logoutAt = new Date();
  session.endReason = reason || 'LOGOUT';
  if (endedBy) session.endedBy = endedBy;
  await session.save();
  return session;
};

module.exports = {
  ONLINE_WINDOW_MS, sessionStatus, sessionDurationMs, createSession, resolveSession, recordHeartbeat, endSession
};
