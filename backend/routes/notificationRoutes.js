const express = require('express');
const { auth, authorizeRoles } = require('../middleware/auth');
const Notification = require('../models/Notification');
const Store = require('../models/Store');

const router = express.Router();

const visibleQuery = (user) => {
  if (user.role === 'ADMIN') {
    return { $or: [{ recipientRole: 'ADMIN' }, { type: 'BROADCAST' }] };
  }
  return {
    $or: [
      { recipientStoreId: user.storeId },
      { recipientRole: 'MINI_STORE' },
      { type: 'BROADCAST' }
    ]
  };
};

// Notifications addressed only to this reader use the plain isRead flag;
// shared ones (all-store broadcasts) track readers in readBy so one store reading doesn't clear it for others.
const directQuery = (user) =>
  user.role === 'ADMIN' ? { recipientRole: 'ADMIN' } : { recipientStoreId: user.storeId };

const readerKey = (user) => (user.role === 'ADMIN' ? 'ADMIN' : String(user.storeId));

const isDirect = (notif, user) =>
  user.role === 'ADMIN'
    ? notif.recipientRole === 'ADMIN'
    : Boolean(notif.recipientStoreId) && String(notif.recipientStoreId) === String(user.storeId);

const withReaderState = (notif, user) => {
  const obj = notif.toObject ? notif.toObject() : notif;
  const isRead = isDirect(obj, user) ? Boolean(obj.isRead) : (obj.readBy || []).includes(readerKey(user));
  const { readBy, ...rest } = obj;
  return { ...rest, isRead };
};

router.get('/', auth, async (req, res) => {
  try {
    const notifications = await Notification.find(visibleQuery(req.user)).sort({ createdAt: -1 }).limit(50);
    res.send(notifications.map((n) => withReaderState(n, req.user)));
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
    res.send(withReaderState(notification, req.user));
  } catch (error) {
    res.status(500).send({ error: 'Server error' });
  }
});

router.put('/read-all', auth, async (req, res) => {
  try {
    const direct = directQuery(req.user);
    await Notification.updateMany(direct, { isRead: true });
    await Notification.updateMany(
      { $and: [visibleQuery(req.user), { $nor: [direct] }] },
      { $addToSet: { readBy: readerKey(req.user) } }
    );
    res.send({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).send({ error: 'Server error' });
  }
});

// Admin: Send broadcast / announcement to stores
router.post('/broadcast', auth, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { title, message, targetStoreId } = req.body;

    const notification = new Notification({
      recipientRole: targetStoreId ? undefined : 'MINI_STORE',
      recipientStoreId: targetStoreId || undefined,
      type: 'BROADCAST',
      title: title || 'System Announcement',
      message
    });

    await notification.save();

    // Broadcast via socket
    const io = req.app.get('io');
    if (io) {
      if (targetStoreId) {
        io.to(`STORE_${targetStoreId}`).emit('new_notification', notification);
      } else {
        io.emit('new_notification', notification);
      }
    }

    res.status(201).send(notification);
  } catch (error) {
    res.status(500).send({ error: 'Failed to broadcast notification' });
  }
});

module.exports = router;
