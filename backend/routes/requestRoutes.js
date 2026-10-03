const express = require('express');
const { auth, authorizeRoles } = require('../middleware/auth');
const MedicineRequest = require('../models/MedicineRequest');
const Notification = require('../models/Notification');
const Medicine = require('../models/Medicine');
const MainInventory = require('../models/MainInventory');
const Customer = require('../models/Customer');

const router = express.Router();

const generateRequestId = async () => {
  const count = await MedicineRequest.countDocuments();
  return `MR-${10000 + count + 1}`;
};

// Admin: Get Dashboard Metrics (Requests) - Place before generic routes!
router.get('/dashboard-metrics', auth, async (req, res) => {
  try {
    const totalRequests = await MedicineRequest.countDocuments();
    const pendingRequests = await MedicineRequest.countDocuments({ status: 'Pending' });
    const completedRequests = await MedicineRequest.countDocuments({ status: 'Completed' });
    
    // Aggregation for most requested medicines
    const topMedicines = await MedicineRequest.aggregate([
      { $group: { _id: "$medicineName", count: { $sum: 1 }, totalQuantity: { $sum: "$quantity" } } },
      { $sort: { count: -1 } },
      { $limit: 6 }
    ]);

    // Store requests breakdown
    const storeRequests = await MedicineRequest.aggregate([
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
    // Total demanded units per medicine
    const medicineDemand = await MedicineRequest.aggregate([
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
    const storeId = req.user.storeId;
    
    const today = new Date();
    today.setHours(0,0,0,0);

    const totalRequests = await MedicineRequest.countDocuments(storeId ? { storeId } : {});
    const pendingRequests = await MedicineRequest.countDocuments(storeId ? { storeId, status: 'Pending' } : { status: 'Pending' });
    const todaysRequests = await MedicineRequest.countDocuments(storeId ? { storeId, createdAt: { $gte: today } } : { createdAt: { $gte: today } });

    res.send({ totalRequests, pendingRequests, todaysRequests });
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
    const employeeName = req.user.name || 'Store Staff';
    
    // Fetch storeCode if not already populated on req.user.storeId
    let storeCode = '';
    if (req.user.storeId && typeof req.user.storeId === 'object' && req.user.storeId.storeCode) {
      storeCode = req.user.storeId.storeCode;
    } else if (storeId) {
      const Store = require('../models/Store');
      const st = await Store.findById(storeId);
      if (st) storeCode = st.storeCode;
    }

    const nameToUse = productName || medicineName;
    const requestId = await generateRequestId();
    
    const request = new MedicineRequest({
      requestId,
      storeId,
      storeCode,
      employeeName,
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

    // Create notification for ADMIN
    const notification = new Notification({
      recipientRole: 'ADMIN',
      type: 'NEW_REQUEST',
      title: 'New Medicine Requisition',
      message: `Requisition ${request.requestId} submitted by ${employeeName} (${request.storeId?.storeName || storeCode}) for ${quantity} units of ${nameToUse}.`,
      requestId: request._id
    });
    await notification.save();

    // Emit via Socket.io to ADMIN_ROOM
    const io = req.app.get('io');
    if (io) {
      io.to('ADMIN_ROOM').emit('medicine_request_created', {
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
        createdAt: request.createdAt
      });
      io.to('ADMIN_ROOM').emit('new_notification', notification);
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
    } else if (req.query.storeId) {
      query.storeId = req.query.storeId;
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

    const request = await MedicineRequest.findByIdAndUpdate(
      req.params.id,
      { 
        status, 
        mainBranchResponse: responseToSave, 
        adminNotes: responseToSave, 
        expectedDate 
      },
      { new: true, runValidators: true }
    ).populate('storeId', 'storeName storeCode location');

    if (!request) {
      return res.status(404).send({ error: 'Request not found' });
    }

    // Create notification for Mini Store
    const notification = new Notification({
      recipientStoreId: request.storeId._id,
      type: 'STATUS_UPDATE',
      title: 'Requisition Response Updated',
      message: `Request ${request.requestId} (${request.productName || request.medicineName}) updated to "${status}". Main Branch Response: "${responseToSave || 'No notes'}".`,
      requestId: request._id
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
        adminNotes: request.adminNotes
      });
      io.to(storeRoom).emit('new_notification', notification);
    }

    res.send(request);
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).send({ error: 'Server error updating status' });
  }
});

module.exports = router;
