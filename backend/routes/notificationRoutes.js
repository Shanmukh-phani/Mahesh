const crypto = require('crypto');
const mongoose = require('mongoose');
const express = require('express');
const { auth, authorizeRoles } = require('../middleware/auth');
const Notification = require('../models/Notification');
const Store = require('../models/Store');

const router = express.Router();

const visibleQuery = (user) => {
  if (user.role === 'ADMIN') {
    return { $or: [{ recipientRole: 'ADMIN' }, { type: 'BROADCAST' }] };
  }
  if (user.role === 'EXECUTIVE') {
    return { recipientRole: 'EXECUTIVE', recipientUserId: user._id };
  }
  return {
    $or: [
      { recipientStoreId: user.storeId },
      { recipientRole: 'MINI_STORE' },
      // all-store broadcasts only; store-targeted ones match recipientStoreId above
      { type: 'BROADCAST', recipientStoreId: null }
    ]
  };
};

// Notifications addressed only to this reader use the plain isRead flag;
// shared ones (all-store broadcasts, main-branch notifications seen by every admin) track readers in readBy,
// so one reader clearing it doesn't clear it for the others.
const directQuery = (user) => {
  if (user.role === 'ADMIN') return null;
  if (user.role === 'EXECUTIVE') return { recipientRole: 'EXECUTIVE', recipientUserId: user._id };
  return { recipientStoreId: user.storeId };
};

const readerKey = (user) => {
  if (user.role === 'ADMIN') return `ADMIN_${user._id}`;
  if (user.role === 'EXECUTIVE') return `EXEC_${user._id}`;
  return String(user.storeId);
};

const isDirect = (notif, user) => {
  if (user.role === 'ADMIN') return false;
  if (user.role === 'EXECUTIVE') return true;
  return Boolean(notif.recipientStoreId) && String(notif.recipientStoreId) === String(user.storeId);
};

const withReaderState = (notif, user) => {
  const obj = notif.toObject ? notif.toObject() : notif;
  const readBy = obj.readBy || [];
  let isRead;
  if (isDirect(obj, user)) {
    isRead = Boolean(obj.isRead);
  } else if (user.role === 'ADMIN') {
    // isRead / 'ADMIN' are from before admins had individual read state
    isRead = readBy.includes(readerKey(user)) || readBy.includes('ADMIN') || (obj.recipientRole === 'ADMIN' && Boolean(obj.isRead));
  } else {
    isRead = readBy.includes(readerKey(user));
  }
  const { readBy: _readBy, ...rest } = obj;
  return { ...rest, isRead };
};

// Admins see a multi-store broadcast once, listing the stores it went to
const collapseGroups = (list, user) => {
  if (user.role !== 'ADMIN') return list;
  const seen = new Map();
  const out = [];
  list.forEach((n) => {
    if (!n.broadcastGroup) {
      out.push(n);
      return;
    }
    const first = seen.get(n.broadcastGroup);
    if (first) {
      first.isRead = first.isRead && n.isRead;
      return;
    }
    const merged = {
      ...n,
      storeCode: (n.targetStoreCodes || []).join(', ') || n.storeCode,
      storeName: n.targetStoreCodes?.length > 1 ? `${n.targetStoreCodes.length} stores` : n.storeName
    };
    seen.set(n.broadcastGroup, merged);
    out.push(merged);
  });
  return out;
};

router.get('/', auth, async (req, res) => {
  try {
    const notifications = await Notification.find(visibleQuery(req.user))
      .sort({ createdAt: -1 })
      .limit(50)
      .populate({
        path: 'requestId',
        select: 'requestId storeCode storeId productName medicineName',
        populate: { path: 'storeId', select: 'storeName storeCode' }
      });
    res.send(collapseGroups(notifications.map((n) => withReaderState(n, req.user)), req.user));
  } catch (error) {
    res.status(500).send({ error: 'Server error' });
  }
});

router.put('/:id/read', auth, async (req, res) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, ...visibleQuery(req.user) });
    if (!notification) {
      return res.status(404).send({ error: 'Notification not found' });
    }
    if (isDirect(notification, req.user)) {
      notification.isRead = true;
    } else if (!notification.readBy.includes(readerKey(req.user))) {
      notification.readBy.push(readerKey(req.user));
    }
    await notification.save();
    if (req.user.role === 'ADMIN' && notification.broadcastGroup) {
      await Notification.updateMany({ broadcastGroup: notification.broadcastGroup }, { $addToSet: { readBy: readerKey(req.user) } });
    }
    res.send(withReaderState(notification, req.user));
  } catch (error) {
    res.status(500).send({ error: 'Server error' });
  }
});

router.put('/read-all', auth, async (req, res) => {
  try {
    const direct = directQuery(req.user);
    if (direct) await Notification.updateMany(direct, { isRead: true });
    await Notification.updateMany(
      direct ? { $and: [visibleQuery(req.user), { $nor: [direct] }] } : visibleQuery(req.user),
      { $addToSet: { readBy: readerKey(req.user) } }
    );
    res.send({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).send({ error: 'Server error' });
  }
});

// Admin: Send broadcast / announcement to all stores, or to the chosen stores (targetStoreIds; targetStoreId still accepted)
router.post('/broadcast', auth, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { title, message, targetStoreId, targetStoreIds } = req.body;
    if (!message || !String(message).trim()) {
      return res.status(400).send({ error: 'Message is required' });
    }

    const requested = [...new Set([
      ...(Array.isArray(targetStoreIds) ? targetStoreIds : []),
      ...(targetStoreId ? [targetStoreId] : [])
    ].map(String))];
    const io = req.app.get('io');
    const base = { type: 'BROADCAST', title: title || 'System Announcement', message };

    if (!requested.length) {
      const notification = await Notification.create({ ...base, recipientRole: 'MINI_STORE' });
      if (io) io.emit('new_notification', notification);
      return res.status(201).send(notification);
    }

    if (requested.some((id) => !mongoose.isValidObjectId(id))) {
      return res.status(400).send({ error: 'Invalid store selected' });
    }
    const stores = await Store.find({ _id: { $in: requested } }, 'storeCode storeName').sort({ storeCode: 1 }).lean();
    if (!stores.length) return res.status(400).send({ error: 'Selected stores were not found' });

    const storeCodes = stores.map((st) => st.storeCode);
    const group = stores.length > 1 ? crypto.randomUUID() : undefined;
    const notifications = await Notification.insertMany(stores.map((st) => ({
      ...base,
      recipientStoreId: st._id,
      storeCode: st.storeCode,
      storeName: st.storeName,
      ...(group ? { broadcastGroup: group, targetStoreCodes: storeCodes } : {})
    })));

    if (io) {
      notifications.forEach((n) => io.to(`STORE_${n.recipientStoreId}`).emit('new_notification', n));
    }

    res.status(201).send({ ...notifications[0].toObject(), sentTo: stores.length, targetStoreCodes: storeCodes });
  } catch (error) {
    res.status(500).send({ error: 'Failed to broadcast notification' });
  }
});

module.exports = router;
