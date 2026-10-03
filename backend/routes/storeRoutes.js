const express = require('express');
const { auth, authorizeRoles } = require('../middleware/auth');
const Store = require('../models/Store');
const User = require('../models/User');
const Employee = require('../models/Employee');
const StoreInventory = require('../models/StoreInventory');
const MedicineRequest = require('../models/MedicineRequest');
const bcrypt = require('bcrypt');

const router = express.Router();

// Get all mini stores with metrics (Admin / Mini Store)
router.get('/', auth, async (req, res) => {
  try {
    const stores = await Store.find().sort({ createdAt: -1 });
    
    const storesWithMetrics = await Promise.all(stores.map(async (store) => {
      const inventoryCount = await StoreInventory.countDocuments({ storeId: store._id });
      const pendingRequests = await MedicineRequest.countDocuments({ storeId: store._id, status: 'Pending' });
      const totalRequests = await MedicineRequest.countDocuments({ storeId: store._id });
      const totalEmployees = await Employee.countDocuments({ storeId: store._id });
      const user = await User.findOne({ storeId: store._id }, 'username');
      
      return {
        ...store.toObject(),
        inventoryCount,
        pendingRequests,
        totalRequests,
        totalEmployees,
        username: user ? user.username : store.storeCode
      };
    }));

    res.send(storesWithMetrics);
  } catch (error) {
    console.error('Error fetching stores:', error);
    res.status(500).send({ error: 'Server error fetching stores' });
  }
});

// Admin: Get single Mini Store details with Employees and Recent Requests
router.get('/:id', auth, async (req, res) => {
  try {
    const store = await Store.findById(req.params.id);
    if (!store) {
      return res.status(404).send({ error: 'Store not found' });
    }

    const user = await User.findOne({ storeId: store._id }, 'username role isActive');
    const employees = await Employee.find({ storeId: store._id }).sort({ createdAt: -1 });
    const totalEmployees = employees.length;
    const activeEmployeesCount = employees.filter(e => e.isActive !== false).length;
    const recentRequests = await MedicineRequest.find({ storeId: store._id }).sort({ createdAt: -1 }).limit(10);
    const pendingRequestsCount = await MedicineRequest.countDocuments({ storeId: store._id, status: 'Pending' });

    res.send({
      store,
      loginId: user ? user.username : store.storeCode,
      user,
      employees,
      totalEmployees,
      activeEmployeesCount,
      pendingRequestsCount,
      recentRequests
    });
  } catch (error) {
    console.error('Error fetching single store:', error);
    res.status(500).send({ error: 'Server error fetching store details' });
  }
});

// Admin: Add a new Mini Store, user credentials & default manager employee
router.post('/', auth, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { 
      storeName, 
      storeCode, 
      location, 
      storeAddress, 
      phone, 
      storePhone, 
      email, 
      storeEmail, 
      contactPerson, 
      managerName, 
      managerPhone, 
      managerEmail, 
      status, 
      username, 
      password 
    } = req.body;

    const codeToUse = (storeCode || '').trim().toUpperCase();
    const nameToUse = (storeName || '').trim();
    const addressToUse = location || storeAddress || '';
    const phoneToUse = phone || storePhone || '';
    const emailToUse = email || storeEmail || '';
    const mgrName = managerName || contactPerson || 'Branch Manager';
    const mgrPhone = managerPhone || phoneToUse;
    const mgrEmail = managerEmail || emailToUse;
    const storeStatus = status || 'Active';

    if (!codeToUse || !nameToUse) {
      return res.status(400).send({ error: 'Store Code and Store Name are required' });
    }

    const existingStore = await Store.findOne({ storeCode: codeToUse });
    if (existingStore) {
      return res.status(400).send({ error: 'Store Code already exists' });
    }

    const loginUsername = (username || codeToUse).trim();
    const existingUser = await User.findOne({ username: new RegExp(`^${loginUsername}$`, 'i') });
    if (existingUser) {
      return res.status(400).send({ error: 'Username / Store Login ID already exists' });
    }

    // Save Store
    const store = new Store({
      storeCode: codeToUse,
      storeName: nameToUse,
      location: addressToUse,
      phone: phoneToUse,
      email: emailToUse,
      contactPerson: mgrName,
      managerPhone: mgrPhone,
      managerEmail: mgrEmail,
      status: storeStatus,
      isActive: storeStatus === 'Active'
    });
    await store.save();

    // Default login password is store123 unless a custom one is sent
    const passwordHash = await bcrypt.hash((password && String(password).trim()) || 'store123', 10);
    const user = new User({
      username: loginUsername,
      passwordHash,
      role: 'MINI_STORE',
      storeId: store._id,
      name: nameToUse,
      phone: mgrPhone,
      email: mgrEmail,
      isActive: storeStatus === 'Active'
    });
    try {
      await user.save();
    } catch (userErr) {
      await Store.findByIdAndDelete(store._id);
      throw userErr;
    }

    res.status(201).send({
      store,
      user: { username: user.username }
    });
  } catch (error) {
    console.error('Error creating store:', error);
    res.status(500).send({ error: 'Server error creating mini store' });
  }
});

// Admin: Update store details
router.put('/:id', auth, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { 
      storeName, 
      storeCode, 
      location, 
      phone, 
      email, 
      contactPerson, 
      managerPhone, 
      managerEmail, 
      status, 
      isActive 
    } = req.body;

    let updateData = { ...req.body };

    if (status !== undefined) {
      updateData.status = status;
      updateData.isActive = status === 'Active';
    } else if (isActive !== undefined) {
      updateData.isActive = isActive;
      updateData.status = isActive ? 'Active' : 'Inactive';
    }

    const store = await Store.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!store) {
      return res.status(404).send({ error: 'Store not found' });
    }

    // Sync active status with User login
    if (updateData.isActive !== undefined) {
      await User.updateMany({ storeId: store._id }, { isActive: updateData.isActive });
    }

    res.send(store);
  } catch (error) {
    console.error('Error updating store:', error);
    res.status(500).send({ error: 'Server error updating store' });
  }
});

// Admin: Delete a store
router.delete('/:id', auth, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const storeId = req.params.id;
    await Store.findByIdAndDelete(storeId);
    await User.deleteMany({ storeId });
    await Employee.deleteMany({ storeId });
    await StoreInventory.deleteMany({ storeId });

    res.send({ message: 'Store, user login, and employee records deleted successfully' });
  } catch (error) {
    console.error('Error deleting store:', error);
    res.status(500).send({ error: 'Server error deleting store' });
  }
});

// Admin: Get inventory of a specific store
router.get('/:id/inventory', auth, async (req, res) => {
  try {
    const inventory = await StoreInventory.find({ storeId: req.params.id }).populate('medicineId');
    res.send(inventory);
  } catch (error) {
    res.status(500).send({ error: 'Server error fetching store inventory' });
  }
});

module.exports = router;
