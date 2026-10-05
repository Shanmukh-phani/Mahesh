const express = require('express');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { auth, authorizeRoles } = require('../middleware/auth');
const User = require('../models/User');
const Store = require('../models/Store');
const MedicineRequest = require('../models/MedicineRequest');
const { isMainAdmin, actorLabel } = require('../utils/access');

const router = express.Router();

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clean = (v, max = 120) => String(v ?? '').trim().slice(0, max);
const PUBLIC_FIELDS = 'username role adminLevel name email phone isActive createdAt lastLoginAt createdBy';

// Main admin manages admins; any admin manages executives
const canManage = (actor, target) => {
  if (!target) return false;
  if (target.role === 'ADMIN') {
    if (!isMainAdmin(actor)) return false;
    return target.adminLevel === 'SUB';
  }
  return target.role === 'EXECUTIVE';
};

// Requests waiting on an executive who no longer covers the store go straight to the main branch
const forwardPendingForStores = async (storeIds, by, reason) => {
  if (!storeIds.length) return 0;
  const result = await MedicineRequest.updateMany(
    { storeId: { $in: storeIds }, approvalStage: 'PENDING_EXECUTIVE' },
    {
      $set: { approvalStage: 'FORWARDED', lastUpdatedBy: by },
      $push: { actionLog: { action: 'AUTO_FORWARDED', note: reason, by, role: 'SYSTEM', createdAt: new Date() } }
    }
  );
  return result.modifiedCount;
};

const assignStores = async (executive, storeIds, actor) => {
  const ids = [...new Set((storeIds || []).map(String))].filter((id) => mongoose.isValidObjectId(id));
  const previous = (await Store.find({ executiveId: executive._id }, '_id').lean()).map((s) => String(s._id));
  const removed = previous.filter((id) => !ids.includes(id));
  if (removed.length) {
    await Store.updateMany({ _id: { $in: removed } }, { $unset: { executiveId: 1 } });
    await forwardPendingForStores(removed, actorLabel(actor), `Store unassigned from executive ${executive.name || executive.username}`);
  }
  if (ids.length) await Store.updateMany({ _id: { $in: ids } }, { $set: { executiveId: executive._id } });
};

const withStores = async (users) => {
  const execIds = users.filter((u) => u.role === 'EXECUTIVE').map((u) => u._id);
  const stores = execIds.length
    ? await Store.find({ executiveId: { $in: execIds } }, 'storeCode storeName location status executiveId').sort({ storeCode: 1 }).lean()
    : [];
  return users.map((u) => ({
    ...u,
    assignedStores: u.role === 'EXECUTIVE' ? stores.filter((s) => String(s.executiveId) === String(u._id)) : undefined
  }));
};

// Admin: list admins and/or executives
router.get('/', auth, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const roles = req.query.role ? [String(req.query.role)] : ['ADMIN', 'EXECUTIVE'];
    const users = await User.find({ role: { $in: roles.filter((r) => ['ADMIN', 'EXECUTIVE'].includes(r)) } }, PUBLIC_FIELDS)
      .populate('createdBy', 'name username')
      .sort({ role: 1, createdAt: 1 })
      .lean();
    res.send(await withStores(users));
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).send({ error: 'Server error fetching users' });
  }
});

// Admin: create a mini admin (main admin only) or an executive officer
router.post('/', auth, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const role = clean(req.body.role, 20);
    if (!['ADMIN', 'EXECUTIVE'].includes(role)) return res.status(400).send({ error: 'Role must be ADMIN or EXECUTIVE' });
    if (role === 'ADMIN' && !isMainAdmin(req.user)) return res.status(403).send({ error: 'Only the main admin can add admins' });

    const name = clean(req.body.name);
    const username = clean(req.body.username, 60);
    const password = String(req.body.password || '');
    if (!name) return res.status(400).send({ error: 'Name is required' });
    if (!/^[a-zA-Z0-9._-]{3,60}$/.test(username)) return res.status(400).send({ error: 'Username must be 3+ characters: letters, numbers, dot, dash or underscore' });
    if (password.length < 6) return res.status(400).send({ error: 'Password must be at least 6 characters' });
    if (await User.exists({ username: new RegExp(`^${escapeRegex(username)}$`, 'i') })) {
      return res.status(400).send({ error: 'Username already exists' });
    }
    if (await Store.exists({ storeCode: new RegExp(`^${escapeRegex(username)}$`, 'i') })) {
      return res.status(400).send({ error: 'Username cannot be the same as a store code' });
    }

    const user = await User.create({
      username,
      passwordHash: await bcrypt.hash(password, 10),
      role,
      adminLevel: role === 'ADMIN' ? 'SUB' : undefined,
      name,
      email: clean(req.body.email),
      phone: clean(req.body.phone, 20),
      createdBy: req.user._id,
      isActive: true
    });
    if (role === 'EXECUTIVE') await assignStores(user, req.body.storeIds, req.user);

    const saved = await User.findById(user._id, PUBLIC_FIELDS).lean();
    res.status(201).send((await withStores([saved]))[0]);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).send({ error: 'Server error creating user' });
  }
});

// Admin: update profile / reset password / activate / assign stores
router.put('/:id', auth, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send({ error: 'User not found' });
    const target = await User.findById(req.params.id);
    if (!canManage(req.user, target)) return res.status(403).send({ error: 'You cannot change this account' });

    if (req.body.name !== undefined) {
      const name = clean(req.body.name);
      if (!name) return res.status(400).send({ error: 'Name is required' });
      target.name = name;
    }
    if (req.body.email !== undefined) target.email = clean(req.body.email);
    if (req.body.phone !== undefined) target.phone = clean(req.body.phone, 20);
    if (req.body.username !== undefined && clean(req.body.username, 60) !== target.username) {
      const username = clean(req.body.username, 60);
      if (!/^[a-zA-Z0-9._-]{3,60}$/.test(username)) return res.status(400).send({ error: 'Invalid username' });
      if (await User.exists({ _id: { $ne: target._id }, username: new RegExp(`^${escapeRegex(username)}$`, 'i') })) {
        return res.status(400).send({ error: 'Username already exists' });
      }
      target.username = username;
    }
    if (req.body.password) {
      if (String(req.body.password).length < 6) return res.status(400).send({ error: 'Password must be at least 6 characters' });
      target.passwordHash = await bcrypt.hash(String(req.body.password), 10);
    }
    const deactivating = req.body.isActive === false && target.isActive !== false;
    if (req.body.isActive !== undefined) target.isActive = Boolean(req.body.isActive);
    await target.save();

    if (target.role === 'EXECUTIVE') {
      if (req.body.storeIds !== undefined) await assignStores(target, req.body.storeIds, req.user);
      if (deactivating) {
        const storeIds = (await Store.find({ executiveId: target._id }, '_id').lean()).map((s) => s._id);
        await forwardPendingForStores(storeIds, actorLabel(req.user), `Executive ${target.name || target.username} deactivated`);
      }
    }

    const saved = await User.findById(target._id, PUBLIC_FIELDS).lean();
    res.send((await withStores([saved]))[0]);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).send({ error: 'Server error updating user' });
  }
});

router.delete('/:id', auth, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send({ error: 'User not found' });
    const target = await User.findById(req.params.id);
    if (!canManage(req.user, target)) return res.status(403).send({ error: 'You cannot delete this account' });
    if (String(target._id) === String(req.user._id)) return res.status(400).send({ error: 'You cannot delete your own account' });

    if (target.role === 'EXECUTIVE') {
      const storeIds = (await Store.find({ executiveId: target._id }, '_id').lean()).map((s) => s._id);
      await Store.updateMany({ executiveId: target._id }, { $unset: { executiveId: 1 } });
      await forwardPendingForStores(storeIds, actorLabel(req.user), `Executive ${target.name || target.username} removed`);
    }
    await User.deleteOne({ _id: target._id });
    res.send({ message: 'User deleted', _id: target._id });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).send({ error: 'Server error deleting user' });
  }
});

module.exports = router;
