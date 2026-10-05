const express = require('express');
const mongoose = require('mongoose');
const { auth, authorizeRoles } = require('../middleware/auth');
const Complaint = require('../models/Complaint');
const Employee = require('../models/Employee');
const Store = require('../models/Store');
const Notification = require('../models/Notification');
const { actorLabel, storeScopeFilter, canAccessStore, executiveRoom } = require('../utils/access');

const router = express.Router();

const TEXT_MAX = 2000;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);

const optionalNumber = (v) => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

const optionalDate = (v) => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 'invalid' : d;
};

const complaintContext = (complaint) => ({
  requestCode: complaint.complaintId,
  storeCode: complaint.storeCode || '',
  storeName: complaint.storeName || '',
  productName: complaint.medicineName || ''
});

// Validates the store-editable fields. Returns { data } or { error }.
const readComplaintBody = async (body, storeId, user) => {
  const data = {
    customerName: clean(body.customerName, 120),
    customerPhone: clean(body.customerPhone, 20),
    medicineName: clean(body.medicineName, 200),
    medicineBrand: clean(body.medicineBrand, 120),
    batchNumber: clean(body.batchNumber, 60),
    composition: clean(body.composition, 1000),
    complaintText: clean(body.complaintText, TEXT_MAX + 1),
    complaintType: clean(body.complaintType, 60) || 'Not Working / Ineffective'
  };

  if (!data.customerName) return { error: 'Customer name is required' };
  if (!/^[0-9+\-\s]{7,15}$/.test(data.customerPhone)) return { error: 'Enter a valid customer phone number' };
  if (!data.medicineName) return { error: 'Medicine name is required' };
  if (!data.complaintText) return { error: 'Complaint details are required' };
  if (data.complaintText.length > TEXT_MAX) return { error: `Complaint must be at most ${TEXT_MAX} characters` };
  if (!Complaint.TYPES.includes(data.complaintType)) return { error: 'Invalid complaint type' };

  const quantityBought = optionalNumber(body.quantityBought);
  const pricePaid = optionalNumber(body.pricePaid);
  const expectedPrice = optionalNumber(body.expectedPrice);
  if ([quantityBought, pricePaid, expectedPrice].some((n) => Number.isNaN(n))) {
    return { error: 'Quantity and prices must be positive numbers' };
  }
  const complaintDate = optionalDate(body.complaintDate);
  const purchaseDate = optionalDate(body.purchaseDate);
  if (complaintDate === 'invalid' || purchaseDate === 'invalid') return { error: 'Invalid date' };

  // Employee logins record themselves; the body's employeeName is only used for logins without an employee
  let employee = null;
  if (user?.employeeId) {
    employee = await Employee.findOne({ _id: user.employeeId, storeId, isActive: true });
  } else {
    const requestedEmployee = clean(body.employeeName, 120);
    if (!requestedEmployee) return { error: 'Select the employee entering this complaint' };
    employee = await Employee.findOne({
      storeId,
      isActive: true,
      employeeName: new RegExp(`^${escapeRegex(requestedEmployee)}$`, 'i')
    });
  }
  if (!employee) return { error: 'Please select a valid active employee of this store' };

  return {
    data: {
      ...data,
      employeeName: employee.employeeName,
      quantityBought,
      pricePaid,
      expectedPrice,
      complaintDate: complaintDate || new Date(),
      purchaseDate
    }
  };
};

const nextComplaintId = async () => {
  const last = await Complaint.findOne({}, { complaintId: 1 }).sort({ createdAt: -1 });
  const lastNum = Number(String(last?.complaintId || '').replace(/\D/g, '')) || 10000;
  const total = await Complaint.countDocuments();
  return `CMP-${Math.max(lastNum, 10000 + total) + 1}`;
};

// Active employees of the logged-in store (including the manager) for the "Entered by" select
router.get('/employees', auth, authorizeRoles('MINI_STORE'), async (req, res) => {
  try {
    const employees = await Employee.find({ storeId: req.user.storeId, isActive: true })
      .sort({ designation: 1, employeeName: 1 });
    res.send(employees);
  } catch (error) {
    console.error('Complaint employees error:', error);
    res.status(500).send({ error: 'Server error fetching employees' });
  }
});

// Admin: all complaints (optional ?storeIds=a,b). Store: own complaints only.
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'MINI_STORE') {
      query.storeId = req.user.storeId;
    } else if (req.user.role === 'EXECUTIVE') {
      query = await storeScopeFilter(req.user);
    } else if (req.query.storeIds) {
      const ids = String(req.query.storeIds).split(',').filter((id) => mongoose.isValidObjectId(id));
      if (ids.length) query.storeId = { $in: ids };
    }
    const complaints = await Complaint.find(query)
      .populate('storeId', 'storeName storeCode location')
      .sort({ createdAt: -1 });
    res.send(complaints);
  } catch (error) {
    console.error('List complaints error:', error);
    res.status(500).send({ error: 'Server error fetching complaints' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send({ error: 'Complaint not found' });
    const complaint = await Complaint.findById(req.params.id).populate('storeId', 'storeName storeCode location');
    if (!complaint || !(await canAccessStore(req.user, complaint.storeId?._id || complaint.storeId))) {
      return res.status(404).send({ error: 'Complaint not found' });
    }
    res.send(complaint);
  } catch (error) {
    res.status(500).send({ error: 'Server error fetching complaint' });
  }
});

// Store: create complaint, notify the main branch
router.post('/', auth, authorizeRoles('MINI_STORE'), async (req, res) => {
  try {
    const store = await Store.findById(req.user.storeId);
    if (!store) return res.status(400).send({ error: 'Store not found for this login' });

    const { data, error } = await readComplaintBody(req.body, store._id, req.user);
    if (error) return res.status(400).send({ error });
    data.enteredByUserId = req.user._id;

    let complaint;
    for (let attempt = 0; attempt < 5 && !complaint; attempt += 1) {
      try {
        complaint = await Complaint.create({
          ...data,
          complaintId: await nextComplaintId(),
          storeId: store._id,
          storeCode: store.storeCode,
          storeName: store.storeName
        });
      } catch (err) {
        if (err?.code !== 11000) throw err;
      }
    }
    if (!complaint) return res.status(500).send({ error: 'Could not generate a complaint ID, please retry' });
    await complaint.populate('storeId', 'storeName storeCode location');

    const notification = await Notification.create({
      recipientRole: 'ADMIN',
      type: 'NEW_COMPLAINT',
      title: 'New Customer Complaint',
      message: `Store: ${complaint.storeCode} · Complaint: ${complaint.complaintId} · ${complaint.complaintType} · ${complaint.medicineName} · By: ${complaint.employeeName}`,
      ...complaintContext(complaint)
    });

    const io = req.app.get('io');
    if (io) io.to('ADMIN_ROOM').emit('new_notification', notification);

    // The store's executive officer gets a copy for visibility
    if (store.executiveId) {
      const execNotification = await Notification.create({
        recipientRole: 'EXECUTIVE',
        recipientUserId: store.executiveId,
        type: 'NEW_COMPLAINT',
        title: 'New Customer Complaint',
        message: notification.message,
        ...complaintContext(complaint)
      });
      if (io) io.to(executiveRoom(store.executiveId)).emit('new_notification', execNotification);
    }

    res.status(201).send(complaint);
  } catch (error) {
    console.error('Create complaint error:', error);
    res.status(500).send({ error: 'Server error saving complaint' });
  }
});

// Store: edit own complaint
router.put('/:id', auth, authorizeRoles('MINI_STORE'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send({ error: 'Complaint not found' });
    const complaint = await Complaint.findOne({ _id: req.params.id, storeId: req.user.storeId });
    if (!complaint) return res.status(404).send({ error: 'Complaint not found' });

    const { data, error } = await readComplaintBody(req.body, req.user.storeId, req.user);
    if (error) return res.status(400).send({ error });
    // "Entered by" stays the original employee
    delete data.employeeName;

    const unset = {};
    ['quantityBought', 'pricePaid', 'expectedPrice', 'purchaseDate'].forEach((k) => {
      if (data[k] === undefined) { delete data[k]; unset[k] = 1; }
    });

    const updated = await Complaint.findByIdAndUpdate(
      complaint._id,
      { $set: data, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { new: true, runValidators: true }
    ).populate('storeId', 'storeName storeCode location');

    res.send(updated);
  } catch (error) {
    console.error('Update complaint error:', error);
    res.status(500).send({ error: 'Server error updating complaint' });
  }
});

// Store: delete own complaint
router.delete('/:id', auth, authorizeRoles('MINI_STORE'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send({ error: 'Complaint not found' });
    const deleted = await Complaint.findOneAndDelete({ _id: req.params.id, storeId: req.user.storeId });
    if (!deleted) return res.status(404).send({ error: 'Complaint not found' });
    res.send({ message: 'Complaint deleted', _id: deleted._id });
  } catch (error) {
    console.error('Delete complaint error:', error);
    res.status(500).send({ error: 'Server error deleting complaint' });
  }
});

// Admin: respond / change status, notify the store
router.put('/:id/response', auth, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send({ error: 'Complaint not found' });
    const status = clean(req.body.status, 30);
    const message = clean(req.body.message, TEXT_MAX + 1);
    if (!Complaint.STATUSES.includes(status)) return res.status(400).send({ error: 'Invalid status' });
    if (message.length > TEXT_MAX) return res.status(400).send({ error: `Response must be at most ${TEXT_MAX} characters` });

    const existing = await Complaint.findById(req.params.id);
    if (!existing) return res.status(404).send({ error: 'Complaint not found' });
    if (!message && status === existing.status) return res.status(400).send({ error: 'Add a response or change the status' });

    const now = new Date();
    const by = actorLabel(req.user);
    const set = { status, adminResponseAt: now, adminResponseBy: by };
    if (message) set.adminResponse = message;

    const updated = await Complaint.findByIdAndUpdate(
      existing._id,
      { $set: set, $push: { responseHistory: { status, message, by, byId: req.user._id, createdAt: now } } },
      { new: true }
    ).populate('storeId', 'storeName storeCode location');

    const notification = await Notification.create({
      recipientStoreId: updated.storeId?._id || updated.storeId,
      type: 'COMPLAINT_RESPONSE',
      title: 'Complaint Response',
      message: `Complaint ${updated.complaintId} (${updated.medicineName}) is now ${status} (by ${by})${message ? `: "${message}"` : ''}`,
      ...complaintContext(updated)
    });

    const io = req.app.get('io');
    if (io) io.to(`STORE_${String(updated.storeId?._id || updated.storeId)}`).emit('new_notification', notification);

    res.send(updated);
  } catch (error) {
    console.error('Complaint response error:', error);
    res.status(500).send({ error: 'Server error saving response' });
  }
});

module.exports = router;
