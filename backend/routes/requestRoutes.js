const express = require('express');
const { auth, authorizeRoles } = require('../middleware/auth');
const MedicineRequest = require('../models/MedicineRequest');
const Notification = require('../models/Notification');
const Medicine = require('../models/Medicine');
const MainInventory = require('../models/MainInventory');
const Customer = require('../models/Customer');
const Store = require('../models/Store');
const User = require('../models/User');
const {
  actorLabel, actorName, storeScopeFilter, canAccessStore, MAIN_BRANCH_VISIBLE, executiveRoom
} = require('../utils/access');

const router = express.Router();

// Base filter for what the caller may see: admins only see requests past executive approval
const requestScope = async (user) => {
  if (user.role === 'ADMIN') return { ...MAIN_BRANCH_VISIBLE };
  return storeScopeFilter(user);
};

// Active executive officer for a store, or null
const activeExecutiveFor = async (storeId) => {
  const store = await Store.findById(storeId, 'executiveId').lean();
  if (!store?.executiveId) return null;
  return User.findOne({ _id: store.executiveId, role: 'EXECUTIVE', isActive: true }, 'name username').lean();
};

const requestCreatedPayload = (request) => ({
  _id: request._id,
  requestId: request.requestId,
  storeId: request.storeId,
  storeCode: request.storeCode,
  employeeName: request.employeeName,
  productName: request.productName,
  medicineName: request.medicineName,
  composition: request.composition,
  quantity: request.quantity,
  customer: request.customer,
  comments: request.comments,
  status: request.status,
  approvalStage: request.approvalStage,
  executiveReview: request.executiveReview,
  raisedBy: request.raisedBy,
  createdAt: request.createdAt
});

// Sends the request to the main branch inbox (notification + live events)
const announceToMainBranch = async (io, request, extra = '') => {
  const notification = await Notification.create({
    recipientRole: 'ADMIN',
    type: 'NEW_REQUEST',
    title: 'New Medicine Requisition',
    message: `Requisition ${request.requestId} submitted by ${request.employeeName} (${request.storeId?.storeName || request.storeCode}) for ${request.quantity} units of ${request.productName || request.medicineName}.${extra}`,
    requestId: request._id,
    ...requestContext(request)
  });
  if (io) {
    io.to('ADMIN_ROOM').emit('medicine_request_created', requestCreatedPayload(request));
    io.to('ADMIN_ROOM').emit('new_notification', notification);
  }
};

// Expects request.storeId to be populated with storeName / storeCode
const requestContext = (request) => ({
  requestCode: request.requestId,
  storeCode: request.storeCode || request.storeId?.storeCode || '',
  storeName: request.storeId?.storeName || '',
  productName: request.productName || request.medicineName || ''
});

const generateRequestId = async () => {
  const count = await MedicineRequest.countDocuments();
  return `MR-${10000 + count + 1}`;
};

// Admin: Get Dashboard Metrics (Requests) - Place before generic routes!
router.get('/dashboard-metrics', auth, async (req, res) => {
  try {
    const scope = await requestScope(req.user);
    const totalRequests = await MedicineRequest.countDocuments(scope);
    const pendingRequests = await MedicineRequest.countDocuments({ ...scope, status: 'Pending' });
    const completedRequests = await MedicineRequest.countDocuments({ ...scope, status: 'Completed' });
    
    // Aggregation for most requested medicines
    const topMedicines = await MedicineRequest.aggregate([
      { $match: scope },
      { $group: { _id: "$medicineName", count: { $sum: 1 }, totalQuantity: { $sum: "$quantity" } } },
      { $sort: { count: -1 } },
      { $limit: 6 }
    ]);

    // Store requests breakdown
    const storeRequests = await MedicineRequest.aggregate([
      { $match: scope },
      { $group: { _id: "$storeId", count: { $sum: 1 } } },
      { $lookup: { from: 'stores', localField: '_id', foreignField: '_id', as: 'store' } },
      { $unwind: "$store" },
      { $project: { storeName: "$store.storeName", storeCode: "$store.storeCode", count: 1 } },
      { $sort: { count: -1 } }
    ]);

    res.send({ totalRequests, pendingRequests, completedRequests, topMedicines, storeRequests });
  } catch (error) {
    console.error('Error in dashboard-metrics:', error);
    res.status(500).send({ error: 'Server error' });
  }
});

// Medicine Demand Analytics Endpoint - Place before generic routes!
router.get('/demand-analytics', auth, async (req, res) => {
  try {
    const scope = await requestScope(req.user);
    // Total demanded units per medicine
    const medicineDemand = await MedicineRequest.aggregate([
      { $match: scope },
      {
        $group: {
          _id: "$medicineName",
          totalRequests: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          pendingCount: {
            $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] }
          },
          completedCount: {
            $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] }
          }
        }
      },
      { $sort: { totalQuantity: -1 } }
    ]);

    // Status distribution
    const statusDistribution = await MedicineRequest.aggregate([
      { $match: scope },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    // High velocity vs low velocity metrics
    const highDemandThreshold = 5;
    const highDemandItems = medicineDemand.filter(m => m.totalQuantity >= highDemandThreshold);
    const moderateDemandItems = medicineDemand.filter(m => m.totalQuantity < highDemandThreshold && m.totalQuantity >= 2);
    const lowDemandItems = medicineDemand.filter(m => m.totalQuantity < 2);

    res.send({
      medicineDemand: medicineDemand || [],
      statusDistribution: statusDistribution || [],
      summary: {
        totalDemandItems: medicineDemand.length || 0,
        highDemandCount: highDemandItems.length || 0,
        moderateDemandCount: moderateDemandItems.length || 0,
        lowDemandCount: lowDemandItems.length || 0
      }
    });
  } catch (error) {
    console.error('Error in demand-analytics:', error);
    res.status(500).send({ error: 'Server error' });
  }
});

// Mini Store Dashboard Metrics
router.get('/ministore-metrics', auth, async (req, res) => {
  try {
    const scope = await requestScope(req.user);
    
    const today = new Date();
    today.setHours(0,0,0,0);

    const totalRequests = await MedicineRequest.countDocuments(scope);
    const pendingRequests = await MedicineRequest.countDocuments({ ...scope, status: 'Pending' });
    const todaysRequests = await MedicineRequest.countDocuments({ ...scope, createdAt: { $gte: today } });
    const awaitingExecutive = await MedicineRequest.countDocuments({ ...scope, approvalStage: 'PENDING_EXECUTIVE' });

    res.send({ totalRequests, pendingRequests, todaysRequests, awaitingExecutive });
  } catch (error) {
    console.error('Error in ministore-metrics:', error);
    res.status(500).send({ error: 'Server error' });
  }
});

// Mini Store: Create a new request
router.post('/', auth, authorizeRoles('MINI_STORE'), async (req, res) => {
  try {
    const { productName, medicineName, composition, quantity, customer, comments } = req.body;
    const storeId = req.user.storeId;
    // The logged-in employee raises the request; the client-sent employeeName is ignored
    const employeeName = req.user.employeeName || req.user.name || 'Store Staff';
    
    let storeCode = '';
    if (storeId) {
      const st = await Store.findById(storeId);
      if (st) storeCode = st.storeCode;
    }

    const nameToUse = productName || medicineName;
    const requestId = await generateRequestId();
    const executive = await activeExecutiveFor(storeId);
    const now = new Date();
    
    const request = new MedicineRequest({
      requestId,
      storeId,
      storeCode,
      employeeName,
      raisedBy: { userId: req.user._id, employeeId: req.user.employeeId, name: employeeName },
      approvalStage: executive ? 'PENDING_EXECUTIVE' : 'FORWARDED',
      lastUpdatedBy: employeeName,
      actionLog: [
        { action: 'CREATED', status: 'Pending', by: employeeName, byId: req.user._id, role: 'MINI_STORE', createdAt: now },
        ...(executive ? [] : [{ action: 'AUTO_FORWARDED', note: 'No executive officer assigned to this store', by: 'System', role: 'SYSTEM', createdAt: now }])
      ],
      productName: nameToUse,
      medicineName: nameToUse,
      composition: composition || '',
      quantity,
      customer: {
        name: customer?.name || 'Anonymous',
        address: customer?.address || '',
        phone: customer?.phone || ''
      },
      comments: comments || '',
      status: 'Pending'
    });
    
    await request.save();
    await request.populate('storeId', 'storeName storeCode location');

    // Sync Customer in Customer model
    if (customer && customer.phone) {
      try {
        let existingCust = await Customer.findOne({ phone: customer.phone });
        if (existingCust) {
          existingCust.totalRequests = (existingCust.totalRequests || 0) + 1;
          if (customer.name) existingCust.name = customer.name;
          if (customer.address) existingCust.address = customer.address;
          await existingCust.save();
        } else {
          await Customer.create({
            name: customer.name || 'Anonymous',
            phone: customer.phone,
            address: customer.address || '',
            totalRequests: 1,
            preferredStore: storeId
          });
        }
      } catch (custErr) {
        console.error('Customer sync error:', custErr);
      }
    }

    const io = req.app.get('io');
    if (executive) {
      // First level: the store's executive officer reviews before the main branch sees it
      const notification = await Notification.create({
        recipientRole: 'EXECUTIVE',
        recipientUserId: executive._id,
        type: 'APPROVAL_REQUIRED',
        title: 'Approval Needed',
        message: `Requisition ${request.requestId} from ${request.storeId?.storeName || storeCode} by ${employeeName}: ${quantity} × ${nameToUse}. Review and approve to send it to the main branch.`,
        requestId: request._id,
        ...requestContext(request)
      });
      if (io) {
        io.to(executiveRoom(executive._id)).emit('medicine_request_created', requestCreatedPayload(request));
        io.to(executiveRoom(executive._id)).emit('new_notification', notification);
      }
    } else {
      await announceToMainBranch(io, request);
    }

    res.status(201).send(request);
  } catch (error) {
    console.error('Request creation error:', error);
    res.status(500).send({ error: 'Server error creating request' });
  }
});

// Admin/Mini Store: Get requests with full multi-field filter support
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'MINI_STORE') {
      query.storeId = req.user.storeId;
    } else if (req.user.role === 'EXECUTIVE') {
      if (req.query.storeId) {
        if (!(await canAccessStore(req.user, req.query.storeId))) return res.send([]);
        query.storeId = req.query.storeId;
      } else {
        query = { ...query, ...(await storeScopeFilter(req.user)) };
      }
      if (req.query.stage === 'pending') query.approvalStage = 'PENDING_EXECUTIVE';
      if (req.query.stage === 'rejected') query.approvalStage = 'REJECTED_BY_EXECUTIVE';
      if (req.query.stage === 'forwarded') Object.assign(query, MAIN_BRANCH_VISIBLE);
    } else {
      if (req.query.storeId) query.storeId = req.query.storeId;
      // Main branch works only on executive-approved requests; ?stage=executive shows those still at the executive (read-only)
      if (req.query.stage === 'executive') {
        query.approvalStage = { $in: ['PENDING_EXECUTIVE', 'REJECTED_BY_EXECUTIVE'] };
      } else if (req.query.stage !== 'all') {
        Object.assign(query, MAIN_BRANCH_VISIBLE);
      }
    }

    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.storeCode) {
      query.storeCode = new RegExp(req.query.storeCode, 'i');
    }

    if (req.query.productName) {
      const prodRegex = new RegExp(req.query.productName, 'i');
      query.$or = [{ productName: prodRegex }, { medicineName: prodRegex }];
    }

    if (req.query.employeeName) {
      query.employeeName = new RegExp(req.query.employeeName, 'i');
    }

    if (req.query.customerName) {
      query['customer.name'] = new RegExp(req.query.customerName, 'i');
    }

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [
        { requestId: searchRegex },
        { productName: searchRegex },
        { medicineName: searchRegex },
        { composition: searchRegex },
        { storeCode: searchRegex },
        { employeeName: searchRegex },
        { 'customer.name': searchRegex },
        { 'customer.phone': searchRegex }
      ];
    }

    const requests = await MedicineRequest.find(query)
      .populate('storeId', 'storeName storeCode location')
      .sort({ createdAt: -1 });

    res.send(requests);
  } catch (error) {
    res.status(500).send({ error: 'Server error' });
  }
});

// Admin: Update request status and Main Branch Response
router.put('/:id/status', auth, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { status, mainBranchResponse, adminNotes, expectedDate } = req.body;
    const responseToSave = mainBranchResponse !== undefined ? mainBranchResponse : adminNotes;

    const existing = await MedicineRequest.findById(req.params.id, 'approvalStage');
    if (!existing) {
      return res.status(404).send({ error: 'Request not found' });
    }
    if (existing.approvalStage === 'PENDING_EXECUTIVE' || existing.approvalStage === 'REJECTED_BY_EXECUTIVE') {
      return res.status(400).send({ error: 'This request has not been approved by the executive officer yet' });
    }

    const by = actorLabel(req.user);
    const now = new Date();
    const request = await MedicineRequest.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status,
          mainBranchResponse: responseToSave,
          adminNotes: responseToSave,
          expectedDate,
          lastUpdatedBy: by
        },
        $push: {
          mainBranchResponseHistory: {
            status,
            message: responseToSave || '',
            expectedDate: expectedDate || undefined,
            by,
            byId: req.user._id,
            createdAt: now
          },
          actionLog: { action: 'STATUS_UPDATE', status, note: responseToSave || '', by, byId: req.user._id, role: 'ADMIN', createdAt: now }
        }
      },
      { new: true, runValidators: true }
    ).populate('storeId', 'storeName storeCode location executiveId');

    if (!request) {
      return res.status(404).send({ error: 'Request not found' });
    }

    // Create notification for Mini Store
    const notification = new Notification({
      recipientStoreId: request.storeId._id,
      type: 'STATUS_UPDATE',
      title: 'Requisition Response Updated',
      message: `Request ${request.requestId} (${request.productName || request.medicineName}) updated to "${status}" by ${by}. Main Branch Response: "${responseToSave || 'No notes'}".`,
      requestId: request._id,
      ...requestContext(request)
    });
    await notification.save();

    // Emit via Socket.io to the specific store room
    const io = req.app.get('io');
    if (io) {
      const storeRoom = `STORE_${request.storeId._id}`;
      io.to(storeRoom).emit('medicine_request_updated', {
        requestId: request.requestId,
        _id: request._id,
        status: request.status,
        message: notification.message,
        mainBranchResponse: request.mainBranchResponse,
        adminNotes: request.adminNotes,
        lastUpdatedBy: by
      });
      io.to(storeRoom).emit('new_notification', notification);
      // Other admins and the store's executive see the change live
      io.to('ADMIN_ROOM').emit('medicine_request_updated', request);
      if (request.storeId.executiveId) io.to(executiveRoom(request.storeId.executiveId)).emit('medicine_request_updated', request);
    }

    res.send(request);
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).send({ error: 'Server error updating status' });
  }
});

// Executive officer: first-level approval for a request from one of their stores
router.put('/:id/executive-review', auth, authorizeRoles('EXECUTIVE'), async (req, res) => {
  try {
    const decision = String(req.body.decision || '').toLowerCase();
    const note = String(req.body.note || '').trim().slice(0, 1000);
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).send({ error: 'Decision must be approve or reject' });
    }
    if (decision === 'reject' && !note) {
      return res.status(400).send({ error: 'Please give a reason for rejecting' });
    }

    const request = await MedicineRequest.findById(req.params.id);
    if (!request || !(await canAccessStore(req.user, request.storeId))) {
      return res.status(404).send({ error: 'Request not found' });
    }
    if (request.approvalStage !== 'PENDING_EXECUTIVE') {
      return res.status(400).send({ error: 'This request is not waiting for your approval' });
    }

    const by = actorLabel(req.user);
    const now = new Date();
    const approved = decision === 'approve';
    const set = {
      approvalStage: approved ? 'FORWARDED' : 'REJECTED_BY_EXECUTIVE',
      executiveReview: { decision: approved ? 'Approved' : 'Rejected', note, by: actorName(req.user), byId: req.user._id, at: now },
      lastUpdatedBy: by
    };
    if (!approved) set.status = 'Rejected';

    const updated = await MedicineRequest.findOneAndUpdate(
      { _id: request._id, approvalStage: 'PENDING_EXECUTIVE' },
      {
        $set: set,
        $push: { actionLog: { action: approved ? 'EXECUTIVE_APPROVED' : 'EXECUTIVE_REJECTED', status: approved ? 'Pending' : 'Rejected', note, by, byId: req.user._id, role: 'EXECUTIVE', createdAt: now } }
      },
      { new: true }
    ).populate('storeId', 'storeName storeCode location');
    if (!updated) {
      return res.status(409).send({ error: 'This request was already reviewed' });
    }

    const io = req.app.get('io');
    if (approved) {
      await announceToMainBranch(io, updated, ` Approved by executive ${actorName(req.user)}${note ? `: "${note}"` : ''}.`);
    }

    const storeNotification = await Notification.create({
      recipientStoreId: updated.storeId._id,
      type: 'EXECUTIVE_REVIEW',
      title: approved ? 'Approved by Executive' : 'Rejected by Executive',
      message: approved
        ? `Request ${updated.requestId} (${updated.productName}) was approved by ${actorName(req.user)} and sent to the main branch.${note ? ` Note: "${note}"` : ''}`
        : `Request ${updated.requestId} (${updated.productName}) was rejected by ${actorName(req.user)}. Reason: "${note}"`,
      requestId: updated._id,
      ...requestContext(updated)
    });
    if (io) {
      const storeRoom = `STORE_${updated.storeId._id}`;
      io.to(storeRoom).emit('medicine_request_updated', {
        requestId: updated.requestId,
        _id: updated._id,
        status: updated.status,
        approvalStage: updated.approvalStage,
        executiveReview: updated.executiveReview,
        message: storeNotification.message
      });
      io.to(storeRoom).emit('new_notification', storeNotification);
      io.to(executiveRoom(req.user._id)).emit('medicine_request_updated', updated);
    }

    res.send(updated);
  } catch (error) {
    console.error('Executive review error:', error);
    res.status(500).send({ error: 'Server error saving review' });
  }
});

const STORE_RESPONSE_MAX = 1000;

// Mini Store: add / update the store's response (customer update) on its own request
router.put('/:id/store-response', auth, authorizeRoles('MINI_STORE'), async (req, res) => {
  try {
    const message = String(req.body.message || '').trim();

    if (!message) {
      return res.status(400).send({ error: 'Store response is required' });
    }
    if (message.length > STORE_RESPONSE_MAX) {
      return res.status(400).send({ error: `Store response must be at most ${STORE_RESPONSE_MAX} characters` });
    }

    const request = await MedicineRequest.findOne({ _id: req.params.id, storeId: req.user.storeId });
    if (!request) {
      return res.status(404).send({ error: 'Request not found' });
    }

    const adminResponded = request.status !== 'Pending' || Boolean(request.mainBranchResponse || request.adminNotes);
    if (!adminResponded) {
      return res.status(400).send({ error: 'You can add an update once the main branch has responded' });
    }

    // Recorded against the logged-in employee
    const employeeName = req.user.employeeName || req.user.name || 'Store Staff';

    const now = new Date();
    const updated = await MedicineRequest.findByIdAndUpdate(
      request._id,
      {
        $set: { storeResponse: message, storeResponseBy: employeeName, storeResponseAt: now, lastUpdatedBy: employeeName },
        $push: {
          storeResponseHistory: { message, employeeName, createdAt: now },
          actionLog: { action: 'STORE_UPDATE', note: message, by: employeeName, byId: req.user._id, role: 'MINI_STORE', createdAt: now }
        }
      },
      { new: true }
    ).populate('storeId', 'storeName storeCode location');

    const storeCode = updated.storeCode || updated.storeId?.storeCode || '';
    const notification = new Notification({
      recipientRole: 'ADMIN',
      type: 'STORE_RESPONSE',
      title: 'Store Update Received',
      message: `Store: ${storeCode} · Request: ${updated.requestId} · Employee: ${employeeName} · Update: "${message}"`,
      requestId: updated._id,
      ...requestContext(updated)
    });
    await notification.save();

    const io = req.app.get('io');
    if (io) {
      io.to('ADMIN_ROOM').emit('medicine_request_updated', updated);
      io.to('ADMIN_ROOM').emit('new_notification', notification);
    }

    res.send(updated);
  } catch (error) {
    console.error('Store response error:', error);
    res.status(500).send({ error: 'Server error saving store response' });
  }
});

module.exports = router;
