const express = require('express');
const { auth, authorizeRoles } = require('../middleware/auth');
const Employee = require('../models/Employee');
const Store = require('../models/Store');

const router = express.Router();

// Get active employees for logged-in Mini Store user
router.get('/my-store', auth, async (req, res) => {
  try {
    if (!req.user.storeId) {
      return res.send([]);
    }
    const employees = await Employee.find({ 
      storeId: req.user.storeId, 
      isActive: true,
      designation: { $ne: 'Store Manager' }
    }).sort({ designation: 1, employeeName: 1 });

    res.send(employees);
  } catch (error) {
    console.error('Error fetching my-store employees:', error);
    res.status(500).send({ error: 'Server error fetching store employees' });
  }
});

// Get all employees for a specific store
router.get('/store/:storeId', auth, async (req, res) => {
  try {
    const employees = await Employee.find({ storeId: req.params.storeId }).sort({ createdAt: -1 });
    res.send(employees);
  } catch (error) {
    console.error('Error fetching store employees:', error);
    res.status(500).send({ error: 'Server error fetching employees' });
  }
});

// Admin: Add a new employee to a specific store
router.post('/store/:storeId', auth, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { storeId } = req.params;
    const { employeeName, designation, phone, email, address, status, employeeId } = req.body;

    const store = await Store.findById(storeId);
    if (!store) {
      return res.status(404).send({ error: 'Store not found' });
    }

    if (!employeeName || !employeeName.trim()) {
      return res.status(400).send({ error: 'Employee name is required' });
    }

    let empCode = (employeeId || '').trim();
    if (!empCode) {
      const count = await Employee.countDocuments({ storeId });
      const seqStr = String(count + 1).padStart(2, '0');
      empCode = `EMP-${store.storeCode}-${seqStr}`;
    }

    // Check duplicate employeeId in this store
    const existing = await Employee.findOne({ storeId, employeeId: empCode });
    if (existing) {
      return res.status(400).send({ error: `Employee ID "${empCode}" already exists in this store` });
    }

    const empStatus = status || 'Active';

    const employee = new Employee({
      employeeId: empCode,
      storeId,
      storeCode: store.storeCode,
      employeeName: employeeName.trim(),
      designation: designation || 'Employee',
      phone: phone || '',
      email: email || '',
      address: address || '',
      status: empStatus,
      isActive: empStatus === 'Active'
    });

    await employee.save();
    res.status(201).send(employee);
  } catch (error) {
    console.error('Error adding employee:', error);
    res.status(500).send({ error: 'Server error adding employee' });
  }
});

// Admin: Edit employee details
router.put('/:id', auth, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { employeeName, designation, phone, email, status, isActive, employeeId } = req.body;

    let updateData = { ...req.body };
    if (status !== undefined) {
      updateData.status = status;
      updateData.isActive = status === 'Active';
    } else if (isActive !== undefined) {
      updateData.isActive = isActive;
      updateData.status = isActive ? 'Active' : 'Inactive';
    }

    const employee = await Employee.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!employee) {
      return res.status(404).send({ error: 'Employee not found' });
    }

    res.send(employee);
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).send({ error: 'Server error updating employee' });
  }
});

// Admin: Toggle Employee active/inactive status
router.put('/:id/status', auth, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { status, isActive } = req.body;
    const newStatus = status || (isActive ? 'Active' : 'Inactive');
    const newIsActive = newStatus === 'Active';

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      { status: newStatus, isActive: newIsActive },
      { new: true }
    );

    if (!employee) {
      return res.status(404).send({ error: 'Employee not found' });
    }

    res.send(employee);
  } catch (error) {
    console.error('Error updating employee status:', error);
    res.status(500).send({ error: 'Server error updating employee status' });
  }
});

// Admin: Delete Employee
router.delete('/:id', auth, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) {
      return res.status(404).send({ error: 'Employee not found' });
    }
    res.send({ message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).send({ error: 'Server error deleting employee' });
  }
});

module.exports = router;
