const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Store = require('../models/Store');
const Employee = require('../models/Employee');
const { auth } = require('../middleware/auth');
const { logActivity, formatDuration } = require('../utils/activity');
const { createSession, endSession, sessionDurationMs } = require('../utils/sessions');

const router = express.Router();

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Shape stored in localStorage.user on the frontend
const buildUserPayload = async (user) => {
  const store = user.storeId && typeof user.storeId === 'object' ? user.storeId : null;
  let employee = null;
  if (user.employeeId) {
    employee = await Employee.findById(user.employeeId).select('employeeName employeeId designation').lean();
  }
  let assignedStores;
  if (user.role === 'EXECUTIVE') {
    assignedStores = await Store.find({ executiveId: user._id }, 'storeCode storeName location status').sort({ storeCode: 1 }).lean();
  }
  return {
    _id: user._id,
    username: user.username,
    role: user.role,
    adminLevel: user.role === 'ADMIN' ? (user.adminLevel || 'MAIN') : undefined,
    store,
    employee,
    assignedStores,
    name: employee?.employeeName || user.name,
    email: user.email
  };
};

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).send({ error: 'Username and password are required' });
    }

    const trimmedInput = String(username).trim();

    let user = await User.findOne({
      username: new RegExp(`^${escapeRegex(trimmedInput)}$`, 'i'),
      isActive: true
    }).populate('storeId');

    // A store code logs in as that store's manager login
    if (!user) {
      const store = await Store.findOne({ storeCode: new RegExp(`^${escapeRegex(trimmedInput)}$`, 'i'), isActive: true });
      if (store) {
        const managers = await Employee.find({ storeId: store._id, designation: 'Store Manager', isActive: true }, '_id').lean();
        user = await User.findOne({ storeId: store._id, employeeId: { $in: managers.map((m) => m._id) }, isActive: true }).populate('storeId');
      }
    }

    const failLogin = (reason, account, action = 'LOGIN_FAILED') => logActivity({
      user: account ? { _id: account._id, username: account.username, name: account.name, role: account.role, adminLevel: account.adminLevel, employeeId: account.employeeId, storeId: account.storeId?._id || account.storeId } : null,
      storeId: account?.storeId?._id || account?.storeId,
      req,
      category: 'AUTH',
      action,
      outcome: 'FAILED',
      summary: `${action === 'LOGIN_BLOCKED' ? 'Blocked sign-in' : 'Failed sign-in'} as "${trimmedInput}": ${reason}`,
      details: { attemptedLogin: trimmedInput },
      actorUsername: account?.username || trimmedInput,
      method: 'POST',
      path: '/api/auth/login'
    });

    if (!user) {
      failLogin('unknown or inactive login');
      return res.status(400).send({ error: 'Invalid login credentials or account inactive' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      failLogin('wrong password', user);
      return res.status(400).send({ error: 'Invalid login credentials' });
    }

    if (user.role === 'MINI_STORE') {
      if (!user.employeeId) {
        failLogin('shared store login (no employee linked)', user, 'LOGIN_BLOCKED');
        return res.status(403).send({ error: 'Shared store logins are disabled. Ask your executive officer for your employee login.' });
      }
      const employee = await Employee.findById(user.employeeId).select('isActive').lean();
      if (!employee || employee.isActive === false) {
        failLogin('employee is inactive', user, 'LOGIN_BLOCKED');
        return res.status(403).send({ error: 'Your employee account is inactive. Contact your executive officer.' });
      }
      if (user.storeId && user.storeId.isActive === false) {
        failLogin('store is inactive', user, 'LOGIN_BLOCKED');
        return res.status(403).send({ error: 'This store is inactive.' });
      }
    }

    const payload = await buildUserPayload(user);
    let session = null;
    try {
      session = await createSession({ ...user.toObject(), employeeName: payload.employee?.employeeName }, req);
    } catch (err) {
      console.error('[activity] could not start session:', err.message);
    }

    const token = jwt.sign(
      {
        _id: user._id.toString(),
        role: user.role,
        adminLevel: user.role === 'ADMIN' ? (user.adminLevel || 'MAIN') : undefined,
        storeId: user.storeId?._id?.toString(),
        storeCode: user.storeId?.storeCode,
        employeeId: user.employeeId ? String(user.employeeId) : undefined,
        sid: session ? String(session._id) : undefined
      },
      process.env.JWT_SECRET || 'secret123',
      { expiresIn: '7d' }
    );

    User.updateOne({ _id: user._id }, { lastLoginAt: new Date() }).catch(() => {});

    logActivity({
      user: {
        _id: user._id, username: user.username, name: payload.name, role: user.role, adminLevel: user.adminLevel,
        employeeId: user.employeeId, employeeName: payload.employee?.employeeName, designation: payload.employee?.designation,
        storeId: user.storeId?._id, sid: session?._id
      },
      storeId: user.storeId?._id,
      req,
      category: 'AUTH',
      action: 'LOGIN',
      summary: `Signed in${trimmedInput.toLowerCase() !== String(user.username).toLowerCase() ? ` using store code ${trimmedInput.toUpperCase()}` : ''}`,
      entity: 'Session',
      entityId: session ? String(session._id) : undefined,
      method: 'POST',
      path: '/api/auth/login',
      statusCode: 200
    });

    res.send({ user: payload, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).send({ error: 'Server error during authentication' });
  }
});

// Fresh copy of the logged-in user (role, store assignments, employee)
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('storeId');
    if (!user) return res.status(404).send({ error: 'User not found' });
    res.send(await buildUserPayload(user));
  } catch (error) {
    res.status(500).send({ error: 'Server error' });
  }
});

// Ends the current session (the token stops working) and records how long it lasted
router.post('/logout', auth, async (req, res) => {
  try {
    const session = req.user.sid ? await endSession(req.user.sid, { reason: 'LOGOUT' }) : null;
    const ms = session ? sessionDurationMs(session) : 0;
    logActivity({
      user: req.user,
      req,
      category: 'AUTH',
      action: 'LOGOUT',
      summary: session ? `Signed out after ${formatDuration(ms)} (active ${formatDuration(session.activeMs)})` : 'Signed out',
      entity: 'Session',
      entityId: req.user.sid ? String(req.user.sid) : undefined,
      details: session ? { durationMs: ms, activeMs: session.activeMs, pageViews: session.pageViews, actions: session.actions } : undefined,
      method: 'POST',
      path: '/api/auth/logout',
      statusCode: 200
    });
    res.send({ ok: true });
  } catch (error) {
    res.status(500).send({ error: 'Server error during sign out' });
  }
});

// Any logged-in user can change their own password
router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).send({ error: 'New password must be at least 6 characters' });
    }
    const user = await User.findById(req.user._id);
    if (!user || !(await bcrypt.compare(String(currentPassword || ''), user.passwordHash))) {
      return res.status(400).send({ error: 'Current password is incorrect' });
    }
    user.passwordHash = await bcrypt.hash(String(newPassword), 10);
    await user.save();
    res.send({ message: 'Password changed' });
  } catch (error) {
    res.status(500).send({ error: 'Server error changing password' });
  }
});

module.exports = router;
