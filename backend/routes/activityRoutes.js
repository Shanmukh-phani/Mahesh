const express = require('express');
const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');
const UserSession = require('../models/UserSession');
const User = require('../models/User');
const Store = require('../models/Store');
const { auth, authorizeRoles } = require('../middleware/auth');
const { logActivity, serverStartedAt, formatDuration } = require('../utils/activity');
const { ONLINE_WINDOW_MS, sessionStatus, sessionDurationMs, recordHeartbeat, endSession } = require('../utils/sessions');
const { isMainAdmin, actorLabel } = require('../utils/access');

const router = express.Router();

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const assignedStoreIds = async (user) => (await Store.find({ executiveId: user._id }, '_id').lean()).map((s) => s._id);

/**
 * Who may see which logs:
 *  - main admin: everything
 *  - admin (SUB): everything except other admins' activity
 *  - executive: own activity + store users of their assigned stores
 */
const logScope = async (user) => {
  if (isMainAdmin(user)) return {};
  if (user.role === 'ADMIN') return { $or: [{ actorRole: { $ne: 'ADMIN' } }, { actorId: oid(user._id) }] };
  const stores = await assignedStoreIds(user);
  return { $or: [{ actorId: oid(user._id) }, { actorRole: { $in: ['MINI_STORE', 'GUEST'] }, storeId: { $in: stores } }] };
};

const sessionScope = async (user) => {
  if (isMainAdmin(user)) return {};
  if (user.role === 'ADMIN') return { $or: [{ role: { $ne: 'ADMIN' } }, { userId: oid(user._id) }] };
  const stores = await assignedStoreIds(user);
  return { $or: [{ userId: oid(user._id) }, { role: 'MINI_STORE', storeId: { $in: stores } }] };
};

const dateRange = (from, to) => {
  const range = {};
  if (from && !Number.isNaN(Date.parse(from))) range.$gte = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) range.$lte = new Date(to);
  return Object.keys(range).length ? range : null;
};

const and = (...parts) => {
  const list = parts.filter((p) => p && Object.keys(p).length);
  if (!list.length) return {};
  return list.length === 1 ? list[0] : { $and: list };
};

const withSessionState = (s, now = Date.now()) => ({
  ...s,
  status: sessionStatus(s, now),
  durationMs: sessionDurationMs(s)
});

// ---------- Tracking (any logged-in user) ----------

// Sent every minute by an open app tab
router.post('/heartbeat', auth, async (req, res) => {
  try {
    if (!req.user.sid) return res.send({ ok: true });
    const s = await recordHeartbeat(req.user.sid, { visible: req.body?.visible !== false, ending: Boolean(req.body?.ending), path: req.body?.path });
    res.send({ ok: true, activeMs: s?.activeMs || 0 });
  } catch (error) {
    res.status(500).send({ error: 'Server error' });
  }
});

const TRACK_TYPES = {
  PAGE_VIEW: { category: 'NAVIGATION', describe: (e) => `Opened ${e.title || e.path || 'a page'}` },
  EXPORT: { category: 'EXPORT', describe: (e) => `Downloaded Excel "${e.label || 'export'}"${e.rows !== undefined ? ` (${e.rows} rows)` : ''}` }
};

// Client-side events: page views, Excel downloads
router.post('/track', auth, async (req, res) => {
  try {
    const events = (Array.isArray(req.body?.events) ? req.body.events : [req.body]).slice(0, 20);
    let pageViews = 0;
    let lastPath;
    events.forEach((e) => {
      const type = TRACK_TYPES[e?.type];
      if (!type) return;
      if (e.type === 'PAGE_VIEW') { pageViews += 1; lastPath = e.path; }
      logActivity({
        user: req.user,
        req,
        category: type.category,
        action: e.type,
        summary: type.describe(e),
        entityLabel: e.title ? String(e.title).slice(0, 120) : undefined,
        details: {
          path: e.path ? String(e.path).slice(0, 200) : undefined,
          ...(e.label ? { label: String(e.label).slice(0, 200) } : {}),
          ...(e.rows !== undefined ? { rows: Number(e.rows) || 0 } : {})
        },
        path: e.path ? String(e.path).slice(0, 200) : undefined
      });
    });
    if (req.user.sid && pageViews) {
      UserSession.updateOne({ _id: req.user.sid }, { $inc: { pageViews }, lastPath: String(lastPath || '').slice(0, 200) }).catch(() => {});
    }
    res.send({ ok: true });
  } catch (error) {
    res.status(500).send({ error: 'Server error' });
  }
});

// ---------- Viewing (admins + executives) ----------

router.use(auth, authorizeRoles('ADMIN', 'EXECUTIVE'));

router.get('/', async (req, res) => {
  try {
    const { role, userId, storeId, category, action, outcome, from, to, q } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 5000);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const filter = {};
    if (role) filter.actorRole = { $in: String(role).split(',') };
    if (userId && mongoose.isValidObjectId(userId)) filter.actorId = oid(userId);
    if (storeId && mongoose.isValidObjectId(storeId)) filter.storeId = oid(storeId);
    if (category) filter.category = { $in: String(category).split(',') };
    if (action) filter.action = { $in: String(action).split(',') };
    if (outcome) filter.outcome = outcome;
    const at = dateRange(from, to);
    if (at) filter.at = at;
    let search = null;
    if (q && String(q).trim()) {
      const re = new RegExp(escapeRegex(String(q).trim()), 'i');
      search = { $or: [{ summary: re }, { actorName: re }, { actorUsername: re }, { storeCode: re }, { storeName: re }, { entityLabel: re }, { action: re }, { ip: re }] };
    }

    const query = and(await logScope(req.user), filter, search);
    const [items, total] = await Promise.all([
      ActivityLog.find(query).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      ActivityLog.countDocuments(query)
    ]);
    res.send({ items, total, page, limit, hasMore: page * limit < total });
  } catch (error) {
    console.error('activity list error:', error);
    res.status(500).send({ error: 'Server error loading activity' });
  }
});

router.get('/sessions', async (req, res) => {
  try {
    const { role, userId, storeId, status, from, to, q } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 5000);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);

    const filter = {};
    if (role) filter.role = { $in: String(role).split(',') };
    if (userId && mongoose.isValidObjectId(userId)) filter.userId = oid(userId);
    if (storeId && mongoose.isValidObjectId(storeId)) filter.storeId = oid(storeId);
    if (status === 'ONLINE') Object.assign(filter, { logoutAt: null, lastSeenAt: { $gte: onlineSince } });
    if (status === 'ENDED') filter.$or = [{ logoutAt: { $ne: null } }, { lastSeenAt: { $lt: onlineSince } }];
    const loginAt = dateRange(from, to);
    if (loginAt) filter.loginAt = loginAt;
    let search = null;
    if (q && String(q).trim()) {
      const re = new RegExp(escapeRegex(String(q).trim()), 'i');
      search = { $or: [{ name: re }, { username: re }, { storeCode: re }, { storeName: re }, { ip: re }, { device: re }] };
    }

    const query = and(await sessionScope(req.user), filter, search);
    const [items, total] = await Promise.all([
      UserSession.find(query).select('-tokenKey').sort({ loginAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      UserSession.countDocuments(query)
    ]);
    const now = Date.now();
    res.send({ items: items.map((s) => withSessionState(s, now)), total, page, limit, hasMore: page * limit < total });
  } catch (error) {
    console.error('sessions list error:', error);
    res.status(500).send({ error: 'Server error loading sessions' });
  }
});

// Totals for a period: who is online, time spent per user, logins, changes, server uptime
router.get('/summary', async (req, res) => {
  try {
    const now = Date.now();
    const range = dateRange(req.query.from, req.query.to) || { $gte: new Date(new Date().setHours(0, 0, 0, 0)) };
    const sScope = await sessionScope(req.user);
    const lScope = await logScope(req.user);
    const onlineSince = new Date(now - ONLINE_WINDOW_MS);

    const [online, sessions, byCategory, byActor, logins, failedLogins] = await Promise.all([
      UserSession.find(and(sScope, { logoutAt: null, lastSeenAt: { $gte: onlineSince } })).select('-tokenKey').sort({ lastSeenAt: -1 }).lean(),
      // sessions that overlap the period
      UserSession.find(and(sScope, { loginAt: { $lte: range.$lte || new Date(now) } }, { $or: [{ lastSeenAt: { $gte: range.$gte || new Date(0) } }, { logoutAt: { $gte: range.$gte || new Date(0) } }] }))
        .select('-tokenKey').limit(10000).lean(),
      ActivityLog.aggregate([{ $match: and(lScope, { at: range }) }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
      ActivityLog.aggregate([
        { $match: and(lScope, { at: range, actorId: { $ne: null } }) },
        { $group: {
          _id: '$actorId',
          actions: { $sum: { $cond: [{ $in: ['$category', ['NAVIGATION', 'SESSION', 'AUTH']] }, 0, 1] } },
          pageViews: { $sum: { $cond: [{ $eq: ['$action', 'PAGE_VIEW'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$outcome', 'FAILED'] }, 1, 0] } },
          lastActionAt: { $max: '$at' }
        } }
      ]),
      ActivityLog.countDocuments(and(lScope, { at: range, action: 'LOGIN' })),
      ActivityLog.countDocuments(and(lScope, { at: range, action: { $in: ['LOGIN_FAILED', 'LOGIN_BLOCKED'] } }))
    ]);

    const rangeStart = range.$gte ? range.$gte.getTime() : 0;
    const rangeEnd = range.$lte ? range.$lte.getTime() : now;
    const users = new Map();
    let totalMs = 0;
    let totalActiveMs = 0;
    sessions.forEach((s) => {
      const start = Math.max(new Date(s.loginAt).getTime(), rangeStart);
      const end = Math.min(new Date(s.logoutAt || s.lastSeenAt || s.loginAt).getTime(), rangeEnd);
      const ms = Math.max(0, end - start);
      const key = String(s.userId);
      const u = users.get(key) || {
        userId: key, name: s.name, username: s.username, role: s.role, adminLevel: s.adminLevel,
        storeId: s.storeId, storeCode: s.storeCode, storeName: s.storeName,
        sessions: 0, totalMs: 0, activeMs: 0, lastLoginAt: null, lastSeenAt: null, online: false, actions: 0, pageViews: 0, failed: 0
      };
      u.sessions += 1;
      u.totalMs += ms;
      u.activeMs += s.activeMs || 0;
      if (!u.lastLoginAt || s.loginAt > u.lastLoginAt) u.lastLoginAt = s.loginAt;
      if (!u.lastSeenAt || s.lastSeenAt > u.lastSeenAt) u.lastSeenAt = s.lastSeenAt;
      if (sessionStatus(s, now) === 'ONLINE') u.online = true;
      users.set(key, u);
      totalMs += ms;
      totalActiveMs += s.activeMs || 0;
    });
    byActor.forEach((a) => {
      const u = users.get(String(a._id));
      if (u) Object.assign(u, { actions: a.actions, pageViews: a.pageViews, failed: a.failed, lastActionAt: a.lastActionAt });
    });

    const categories = Object.fromEntries(byCategory.map((c) => [c._id, c.count]));
    const changes = byCategory.filter((c) => !['NAVIGATION', 'SESSION', 'AUTH', 'EXPORT', 'SYSTEM'].includes(c._id)).reduce((n, c) => n + c.count, 0);

    let system;
    if (req.user.role === 'ADMIN') {
      const events = await ActivityLog.find({ category: 'SYSTEM' }).sort({ at: -1 }).limit(10).lean();
      system = {
        serverStartedAt,
        uptimeMs: now - serverStartedAt.getTime(),
        nodeVersion: process.version,
        memoryMb: Math.round(process.memoryUsage().rss / 1048576),
        dbState: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
        events
      };
    }

    res.send({
      range: { from: range.$gte || null, to: range.$lte || null },
      online: online.map((s) => withSessionState(s, now)),
      totals: {
        onlineNow: new Set(online.map((s) => String(s.userId))).size,
        activeUsers: users.size,
        sessions: sessions.length,
        logins,
        failedLogins,
        changes,
        pageViews: categories.NAVIGATION || 0,
        exports: categories.EXPORT || 0,
        totalMs,
        activeMs: totalActiveMs
      },
      categories,
      users: [...users.values()].sort((a, b) => b.totalMs - a.totalMs),
      system
    });
  } catch (error) {
    console.error('activity summary error:', error);
    res.status(500).send({ error: 'Server error loading activity summary' });
  }
});

// People the caller can filter by
router.get('/users', async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'ADMIN' && !isMainAdmin(req.user)) {
      filter = { $or: [{ role: { $ne: 'ADMIN' } }, { _id: oid(req.user._id) }] };
    } else if (req.user.role === 'EXECUTIVE') {
      const stores = await assignedStoreIds(req.user);
      filter = { $or: [{ _id: oid(req.user._id) }, { role: 'MINI_STORE', storeId: { $in: stores } }] };
    }
    const users = await User.find(filter, 'username name role adminLevel storeId employeeId isActive')
      .populate('storeId', 'storeCode storeName')
      .populate('employeeId', 'employeeName')
      .sort({ role: 1, username: 1 })
      .lean();
    res.send(users.map((u) => ({
      _id: u._id,
      username: u.username,
      name: u.employeeId?.employeeName || u.name || u.username,
      role: u.role,
      adminLevel: u.adminLevel,
      storeId: u.storeId?._id,
      storeCode: u.storeId?.storeCode,
      storeName: u.storeId?.storeName,
      isActive: u.isActive
    })));
  } catch (error) {
    res.status(500).send({ error: 'Server error' });
  }
});

// Sign a user out remotely (their token stops working immediately)
router.put('/sessions/:id/end', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).send({ error: 'Invalid session' });
    const target = await UserSession.findOne(and({ _id: oid(req.params.id) }, await sessionScope(req.user))).lean();
    if (!target) return res.status(404).send({ error: 'Session not found' });
    if (String(target._id) === String(req.user.sid)) return res.status(400).send({ error: 'Use Logout to end your own current session' });
    if (target.role === 'ADMIN' && !isMainAdmin(req.user)) return res.status(403).send({ error: 'Only the main admin can end admin sessions' });
    if (target.logoutAt) return res.status(400).send({ error: 'Session already ended' });

    const ended = await endSession(target._id, { reason: 'FORCED', endedBy: actorLabel(req.user) });
    logActivity({
      user: req.user,
      req,
      storeId: target.storeId,
      category: 'SESSION',
      action: 'SESSION_ENDED',
      summary: `Signed out ${target.name || target.username}${target.storeCode ? ` (${target.storeCode})` : ''} remotely after ${formatDuration(sessionDurationMs(ended))}`,
      entity: 'Session',
      entityId: String(target._id),
      entityLabel: target.name || target.username,
      method: 'PUT',
      path: req.originalUrl,
      statusCode: 200
    });
    res.send(withSessionState(ended.toObject()));
  } catch (error) {
    res.status(500).send({ error: 'Server error ending session' });
  }
});

module.exports = router;
