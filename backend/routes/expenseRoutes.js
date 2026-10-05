const express = require('express');
const mongoose = require('mongoose');
const StoreExpense = require('../models/StoreExpense');
const Store = require('../models/Store');
const { EXPENSE_CATEGORIES, PAYMENT_MODES, PAYMENT_STATUSES } = require('../models/StoreExpense');
const { auth, authorizeRoles } = require('../middleware/auth');
const { storeScopeFilter, canAccessStore, actorLabel, actorName } = require('../utils/access');
const { monthKey, previousMonthKey, monthLabel, notifyStore, notifyExecutive, MONTH_END_FROM_DAY, MONTH_START_UNTIL_DAY } = require('../utils/expenseReminders');

const router = express.Router();

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
// Checked but not (successfully) paid yet; null covers expenses saved before payments existed
const TO_PAY = { $in: ['Unpaid', 'Not received', null] };
const sumIf = (cond, value = 1) => ({ $sum: { $cond: [cond, value, 0] } });
const payIs = (status) => ({ $eq: [{ $ifNull: ['$paymentStatus', 'Unpaid'] }, status] });
const DATE_RE = /^(\d{4}-\d{2})-\d{2}/;

// "2026-10-05" → { date, month: "2026-10" } (month taken from the typed date so time zones can't shift it)
const parseExpenseDate = (value) => {
  if (!value) return null;
  const s = String(value);
  const date = new Date(s);
  if (Number.isNaN(date.getTime())) return null;
  const m = s.match(DATE_RE);
  return { date, month: m ? m[1] : monthKey(date) };
};

const cleanBody = (body = {}) => {
  const errors = [];
  const parsed = parseExpenseDate(body.expenseDate);
  if (!parsed) errors.push('Expense date is required');
  else if (parsed.date > new Date(Date.now() + 24 * 60 * 60 * 1000)) errors.push('Expense date cannot be in the future');
  if (!EXPENSE_CATEGORIES.includes(body.category)) errors.push('Choose a category');
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.push('Amount must be more than 0');
  if (body.paymentMode && !PAYMENT_MODES.includes(body.paymentMode)) errors.push('Invalid payment mode');
  if (body.category === 'Other' && !String(body.description || '').trim()) errors.push('Add a description for "Other" expenses');
  return {
    errors,
    data: parsed ? {
      expenseDate: parsed.date,
      month: parsed.month,
      category: body.category,
      amount: Math.round(amount * 100) / 100,
      paymentMode: body.paymentMode || 'Cash',
      paidTo: String(body.paidTo || '').trim().slice(0, 120),
      billNumber: String(body.billNumber || '').trim().slice(0, 60),
      description: String(body.description || '').trim().slice(0, 500)
    } : null
  };
};

router.use(auth);

router.get('/meta', (req, res) => {
  res.send({ categories: EXPENSE_CATEGORIES, paymentModes: PAYMENT_MODES, paymentStatuses: PAYMENT_STATUSES, monthEndFromDay: MONTH_END_FROM_DAY, monthStartUntilDay: MONTH_START_UNTIL_DAY });
});

// Store: is anything missing? Drives the reminder banner and the menu badge.
router.get('/status', authorizeRoles('MINI_STORE'), async (req, res) => {
  try {
    const now = new Date();
    const current = monthKey(now);
    const previous = previousMonthKey(now);
    const storeId = new mongoose.Types.ObjectId(req.user.storeId);
    const rows = await StoreExpense.aggregate([
      { $match: { storeId, month: { $in: [current, previous] } } },
      { $group: { _id: '$month', count: { $sum: 1 }, total: { $sum: '$amount' }, checked: { $sum: { $cond: [{ $eq: ['$status', 'Checked'] }, 1, 0] } } } }
    ]);
    const byMonth = Object.fromEntries(rows.map((r) => [r._id, r]));
    const toConfirm = await StoreExpense.aggregate([
      { $match: { storeId, paymentStatus: 'Paid' } },
      { $sort: { paidAt: -1 } },
      { $group: { _id: '$month', count: { $sum: 1 }, total: { $sum: '$amount' }, paidBy: { $first: '$paidBy' }, paidAt: { $first: '$paidAt' }, payoutMode: { $first: '$payoutMode' }, payoutReference: { $first: '$payoutReference' }, payoutNote: { $first: '$payoutNote' } } },
      { $sort: { _id: -1 } }
    ]);
    const day = now.getDate();
    let reminder = null;
    if (day <= MONTH_START_UNTIL_DAY && !byMonth[previous]) reminder = { month: previous, label: monthLabel(previous), kind: 'PREVIOUS' };
    else if (!byMonth[current]) reminder = { month: current, label: monthLabel(current), kind: day >= MONTH_END_FROM_DAY ? 'MONTH_END' : 'CURRENT' };
    res.send({
      current: { month: current, label: monthLabel(current), count: byMonth[current]?.count || 0, total: byMonth[current]?.total || 0, checked: byMonth[current]?.checked || 0 },
      previous: { month: previous, label: monthLabel(previous), count: byMonth[previous]?.count || 0, total: byMonth[previous]?.total || 0, checked: byMonth[previous]?.checked || 0 },
      reminder,
      toConfirm: toConfirm.map(({ _id, ...r }) => ({ month: _id, label: monthLabel(_id), ...r }))
    });
  } catch (error) {
    res.status(500).send({ error: 'Server error' });
  }
});

// List: store sees its own, executive their stores, admin all
router.get('/', authorizeRoles('MINI_STORE', 'EXECUTIVE', 'ADMIN'), async (req, res) => {
  try {
    const filter = req.user.role === 'MINI_STORE'
      ? { storeId: new mongoose.Types.ObjectId(req.user.storeId) }
      : await storeScopeFilter(req.user);
    if (req.query.month && MONTH_RE.test(req.query.month)) filter.month = req.query.month;
    if (req.query.status && ['Pending', 'Checked'].includes(req.query.status)) filter.status = req.query.status;
    if (req.query.payment && PAYMENT_STATUSES.includes(req.query.payment)) filter.paymentStatus = req.query.payment === 'Unpaid' ? { $in: ['Unpaid', null] } : req.query.payment;
    if (req.user.role !== 'MINI_STORE' && req.query.storeId) {
      if (!(await canAccessStore(req.user, req.query.storeId))) return res.status(403).send({ error: 'Access denied' });
      filter.storeId = new mongoose.Types.ObjectId(String(req.query.storeId));
    }
    const expenses = await StoreExpense.find(filter).sort({ expenseDate: -1, createdAt: -1 }).limit(2000).lean();
    res.send(expenses);
  } catch (error) {
    res.status(500).send({ error: 'Server error loading expenses' });
  }
});

// Executive / admin: one row per store for a month, including stores that added nothing
router.get('/summary', authorizeRoles('EXECUTIVE', 'ADMIN'), async (req, res) => {
  try {
    const month = MONTH_RE.test(req.query.month || '') ? req.query.month : monthKey();
    const scope = await storeScopeFilter(req.user, '_id');
    const stores = await Store.find({ ...scope }, 'storeCode storeName location status').sort({ storeCode: 1 }).lean();
    const rows = await StoreExpense.aggregate([
      { $match: { month, storeId: { $in: stores.map((s) => s._id) } } },
      { $group: {
        _id: '$storeId',
        count: { $sum: 1 },
        total: { $sum: '$amount' },
        checked: { $sum: { $cond: [{ $eq: ['$status', 'Checked'] }, 1, 0] } },
        checkedTotal: { $sum: { $cond: [{ $eq: ['$status', 'Checked'] }, '$amount', 0] } },
        toPay: sumIf({ $and: [{ $eq: ['$status', 'Checked'] }, { $in: [{ $ifNull: ['$paymentStatus', 'Unpaid'] }, ['Unpaid', 'Not received']] }] }),
        toPayTotal: sumIf({ $and: [{ $eq: ['$status', 'Checked'] }, { $in: [{ $ifNull: ['$paymentStatus', 'Unpaid'] }, ['Unpaid', 'Not received']] }] }, '$amount'),
        awaitingConfirm: sumIf(payIs('Paid')),
        awaitingTotal: sumIf(payIs('Paid'), '$amount'),
        received: sumIf(payIs('Received')),
        receivedTotal: sumIf(payIs('Received'), '$amount'),
        notReceived: sumIf(payIs('Not received')),
        lastAddedAt: { $max: '$createdAt' }
      } }
    ]);
    const byStore = new Map(rows.map((r) => [String(r._id), r]));
    const reminders = await mongoose.model('Notification').aggregate([
      { $match: { type: 'EXPENSE_REMINDER', requestCode: { $regex: `^EXP-${month}` }, recipientStoreId: { $in: stores.map((s) => s._id) } } },
      { $group: { _id: '$recipientStoreId', last: { $max: '$createdAt' } } }
    ]);
    const remindedAt = new Map(reminders.map((r) => [String(r._id), r.last]));
    res.send({
      month,
      label: monthLabel(month),
      stores: stores.map((s) => {
        const r = byStore.get(String(s._id)) || {};
        return {
          storeId: s._id, storeCode: s.storeCode, storeName: s.storeName, location: s.location, status: s.status,
          count: r.count || 0, total: r.total || 0, checked: r.checked || 0, pending: (r.count || 0) - (r.checked || 0),
          checkedTotal: r.checkedTotal || 0,
          toPay: r.toPay || 0, toPayTotal: r.toPayTotal || 0, awaitingConfirm: r.awaitingConfirm || 0, awaitingTotal: r.awaitingTotal || 0,
          received: r.received || 0, receivedTotal: r.receivedTotal || 0, notReceived: r.notReceived || 0,
          lastAddedAt: r.lastAddedAt || null, lastRemindedAt: remindedAt.get(String(s._id)) || null
        };
      })
    });
  } catch (error) {
    console.error('expense summary error:', error);
    res.status(500).send({ error: 'Server error loading expense summary' });
  }
});

router.post('/', authorizeRoles('MINI_STORE'), async (req, res) => {
  try {
    if (!req.user.storeId) return res.status(400).send({ error: 'Store not linked to this login' });
    const { errors, data } = cleanBody(req.body);
    if (errors.length) return res.status(400).send({ error: errors[0] });
    const store = await Store.findById(req.user.storeId, 'storeCode storeName').lean();
    const expense = await StoreExpense.create({
      ...data,
      storeId: req.user.storeId,
      storeCode: store?.storeCode,
      storeName: store?.storeName,
      addedBy: actorName(req.user),
      addedById: req.user._id
    });
    res.status(201).send(expense);
  } catch (error) {
    res.status(500).send({ error: 'Server error saving expense' });
  }
});

// Executive / admin: check (or un-check) every pending expense of a store for a month
router.put('/check-month', authorizeRoles('EXECUTIVE', 'ADMIN'), async (req, res) => {
  try {
    const { storeId, month, note } = req.body;
    if (!MONTH_RE.test(month || '')) return res.status(400).send({ error: 'Invalid month' });
    if (!(await canAccessStore(req.user, storeId))) return res.status(403).send({ error: 'Access denied' });
    const result = await StoreExpense.updateMany(
      { storeId, month, status: 'Pending' },
      { status: 'Checked', checkedBy: actorLabel(req.user), checkedById: req.user._id, checkedAt: new Date(), checkNote: String(note || '').trim().slice(0, 300) }
    );
    if (result.modifiedCount) {
      const store = await Store.findById(storeId, 'storeCode storeName').lean();
      await notifyStore(req.app.get('io'), store, {
        type: 'EXPENSE_CHECKED',
        title: `${monthLabel(month)} expenses checked`,
        message: `${actorLabel(req.user)} checked ${result.modifiedCount} expense${result.modifiedCount === 1 ? '' : 's'} for ${monthLabel(month)}.${note ? ` Note: ${String(note).trim()}` : ''}`,
        code: `EXP-${month}`
      });
    }
    res.send({ checked: result.modifiedCount });
  } catch (error) {
    res.status(500).send({ error: 'Server error checking expenses' });
  }
});

// Executive / admin: record that checked expenses of a store for a month were paid to the store
router.put('/pay-month', authorizeRoles('EXECUTIVE', 'ADMIN'), async (req, res) => {
  try {
    const { storeId, month } = req.body;
    if (!MONTH_RE.test(month || '')) return res.status(400).send({ error: 'Invalid month' });
    if (!mongoose.isValidObjectId(storeId) || !(await canAccessStore(req.user, storeId))) return res.status(403).send({ error: 'Access denied' });
    if (req.body.payoutMode && !PAYMENT_MODES.includes(req.body.payoutMode)) return res.status(400).send({ error: 'Invalid payment mode' });
    const filter = { storeId, month, status: 'Checked', paymentStatus: TO_PAY };
    const due = await StoreExpense.find(filter, 'amount').lean();
    if (!due.length) return res.status(400).send({ error: 'Nothing to pay. Check the expenses first.' });
    const total = due.reduce((n, e) => n + Number(e.amount || 0), 0);
    const payout = {
      paymentStatus: 'Paid',
      paidBy: actorLabel(req.user),
      paidById: req.user._id,
      paidAt: new Date(),
      payoutMode: req.body.payoutMode || 'Cash',
      payoutReference: String(req.body.payoutReference || '').trim().slice(0, 80),
      payoutNote: String(req.body.payoutNote || '').trim().slice(0, 300)
    };
    const result = await StoreExpense.updateMany({ _id: { $in: due.map((e) => e._id) } },
      { $set: payout, $unset: { receiptBy: 1, receiptById: 1, receiptAt: 1, receiptNote: 1 } });
    const store = await Store.findById(storeId, 'storeCode storeName').lean();
    await notifyStore(req.app.get('io'), store, {
      type: 'EXPENSE_PAID',
      title: `${monthLabel(month)} expenses paid · ₹${total.toLocaleString('en-IN')}`,
      message: `${payout.paidBy} paid ₹${total.toLocaleString('en-IN')} for ${result.modifiedCount} expense${result.modifiedCount === 1 ? '' : 's'} (${payout.payoutMode}${payout.payoutReference ? `, ref ${payout.payoutReference}` : ''}). Please confirm whether you received it.${payout.payoutNote ? ` Note: ${payout.payoutNote}` : ''}`,
      code: `EXP-${month}`
    });
    res.send({ paid: result.modifiedCount, total });
  } catch (error) {
    console.error('expense pay-month error:', error);
    res.status(500).send({ error: 'Server error recording payment' });
  }
});

// Store: confirm whether the money for a month's paid expenses actually arrived
router.put('/confirm-payment', authorizeRoles('MINI_STORE'), async (req, res) => {
  try {
    const { month } = req.body;
    const received = req.body.received !== false;
    const note = String(req.body.note || '').trim().slice(0, 300);
    if (!MONTH_RE.test(month || '')) return res.status(400).send({ error: 'Invalid month' });
    if (!received && !note) return res.status(400).send({ error: 'Tell your executive officer what is wrong (for example: amount not received yet, or less amount received)' });
    const filter = { storeId: req.user.storeId, month, paymentStatus: 'Paid' };
    const due = await StoreExpense.find(filter, 'amount').lean();
    if (!due.length) return res.status(400).send({ error: 'No payment is waiting for your confirmation for this month' });
    const total = due.reduce((n, e) => n + Number(e.amount || 0), 0);
    const by = actorName(req.user);
    const result = await StoreExpense.updateMany({ _id: { $in: due.map((e) => e._id) } }, {
      paymentStatus: received ? 'Received' : 'Not received',
      receiptBy: by,
      receiptById: req.user._id,
      receiptAt: new Date(),
      receiptNote: note
    });
    const store = await Store.findById(req.user.storeId, 'storeCode storeName executiveId').lean();
    await notifyExecutive(req.app.get('io'), store, {
      type: 'EXPENSE_RECEIPT',
      title: received ? `${store.storeCode} received ${monthLabel(month)} payment` : `${store.storeCode}: ${monthLabel(month)} payment NOT received`,
      message: received
        ? `${by} (${store.storeCode}) confirmed receiving ₹${total.toLocaleString('en-IN')} for ${monthLabel(month)} expenses.${note ? ` Note: ${note}` : ''}`
        : `${by} (${store.storeCode}) says the ₹${total.toLocaleString('en-IN')} for ${monthLabel(month)} expenses was not received. Reason: ${note}`,
      code: `EXP-${month}`
    });
    res.send({ updated: result.modifiedCount, total, paymentStatus: received ? 'Received' : 'Not received' });
  } catch (error) {
    console.error('expense confirm-payment error:', error);
    res.status(500).send({ error: 'Server error saving confirmation' });
  }
});

// Executive / admin: nudge a store to add its expenses
router.post('/remind', authorizeRoles('EXECUTIVE', 'ADMIN'), async (req, res) => {
  try {
    const { storeId, message } = req.body;
    const month = MONTH_RE.test(req.body.month || '') ? req.body.month : monthKey();
    if (!(await canAccessStore(req.user, storeId))) return res.status(403).send({ error: 'Access denied' });
    const store = await Store.findById(storeId, 'storeCode storeName').lean();
    if (!store) return res.status(404).send({ error: 'Store not found' });
    const notification = await notifyStore(req.app.get('io'), store, {
      type: 'EXPENSE_REMINDER',
      title: `Please add ${monthLabel(month)} expenses`,
      message: String(message || '').trim() || `${actorLabel(req.user)} is waiting for your ${monthLabel(month)} store expenses. Please add them.`,
      code: `EXP-${month}-MANUAL`
    });
    res.status(201).send({ ok: true, notificationId: notification._id, storeCode: store.storeCode });
  } catch (error) {
    res.status(500).send({ error: 'Server error sending reminder' });
  }
});

const loadOwn = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).send({ error: 'Expense not found' });
    return null;
  }
  const expense = await StoreExpense.findOne({ _id: req.params.id, storeId: req.user.storeId });
  if (!expense) {
    res.status(404).send({ error: 'Expense not found' });
    return null;
  }
  if (expense.status === 'Checked') {
    res.status(400).send({ error: 'This expense was already checked by your executive officer and cannot be changed' });
    return null;
  }
  return expense;
};

router.put('/:id/check', authorizeRoles('EXECUTIVE', 'ADMIN'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send({ error: 'Expense not found' });
    const expense = await StoreExpense.findById(req.params.id);
    if (!expense || !(await canAccessStore(req.user, expense.storeId))) return res.status(404).send({ error: 'Expense not found' });
    if (req.body.checked === false) {
      if (['Paid', 'Received'].includes(expense.paymentStatus)) return res.status(400).send({ error: 'This expense is already paid and cannot be un-checked' });
      expense.status = 'Pending';
      expense.checkedBy = undefined;
      expense.checkedById = undefined;
      expense.checkedAt = undefined;
      expense.checkNote = undefined;
    } else {
      expense.status = 'Checked';
      expense.checkedBy = actorLabel(req.user);
      expense.checkedById = req.user._id;
      expense.checkedAt = new Date();
      expense.checkNote = String(req.body.note || '').trim().slice(0, 300);
    }
    await expense.save();
    res.send(expense);
  } catch (error) {
    res.status(500).send({ error: 'Server error' });
  }
});

router.put('/:id', authorizeRoles('MINI_STORE'), async (req, res) => {
  try {
    const expense = await loadOwn(req, res);
    if (!expense) return;
    const { errors, data } = cleanBody({ ...expense.toObject(), ...req.body });
    if (errors.length) return res.status(400).send({ error: errors[0] });
    Object.assign(expense, data, { lastEditedBy: actorName(req.user) });
    await expense.save();
    res.send(expense);
  } catch (error) {
    res.status(500).send({ error: 'Server error updating expense' });
  }
});

router.delete('/:id', authorizeRoles('MINI_STORE'), async (req, res) => {
  try {
    const expense = await loadOwn(req, res);
    if (!expense) return;
    await expense.deleteOne();
    res.send({ message: 'Expense deleted', _id: expense._id });
  } catch (error) {
    res.status(500).send({ error: 'Server error deleting expense' });
  }
});

module.exports = router;
