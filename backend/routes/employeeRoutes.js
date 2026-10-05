const express = require('express');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { auth, authorizeRoles } = require('../middleware/auth');
const Employee = require('../models/Employee');
const Store = require('../models/Store');
const User = require('../models/User');
const { canAccessStore } = require('../utils/access');

const router = express.Router();

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const withLogins = async (employees) => {
  const ids = employees.map((e) => e._id);
  const logins = await User.find({ employeeId: { $in: ids } }, 'username isActive employeeId lastLoginAt').lean();
  return employees.map((e) => {
    const obj = e.toObject ? e.toObject() : e;
    const login = logins.find((l) => String(l.employeeId) === String(obj._id));
    return { ...obj, login: login ? { username: login.username, isActive: login.isActive, lastLoginAt: login.lastLoginAt } : null };
  });
};

// Creates or updates the employee's personal login. Returns an error string or null.
const upsertLogin = async (employee, { username, password }, actorId) => {
  const wantsUsername = username !== undefined && String(username).trim() !== '';
  const wantsPassword = password !== undefined && String(password) !== '';
  if (!wantsUsername && !wantsPassword) return null;

  const existing = await User.findOne({ employeeId: employee._id });
  const uname = wantsUsername ? String(username).trim() : existing?.username;
  if (!uname) return 'Username is required to create a login';
  if (!/^[a-zA-Z0-9._-]{3,60}$/.test(uname)) return 'Username must be 3+ characters: letters, numbers, dot, dash or underscore';
  if (wantsPassword && String(password).length < 6) return 'Password must be at least 6 characters';
  if (!existing && !wantsPassword) return 'Set a password for the new login';

  const clash = await User.findOne({ username: new RegExp(`^${escapeRegex(uname)}$`, 'i'), _id: { $ne: existing?._id } });
  if (clash) return 'Username already exists';
  const storeClash = await Store.findOne({ storeCode: new RegExp(`^${escapeRegex(uname)}$`, 'i'), _id: { $ne: employee.storeId } });
  if (storeClash) return 'Username cannot be another store\'s code';

  if (existing) {
    existing.username = uname;
    if (wantsPassword) existing.passwordHash = await bcrypt.hash(String(password), 10);
    existing.name = employee.employeeName;
    existing.isActive = employee.isActive !== false;
    await existing.save();
  } else {
    await User.create({
      username: uname,
      passwordHash: await bcrypt.hash(String(password), 10),
      role: 'MINI_STORE',
      storeId: employee.storeId,
      employeeId: employee._id,
      name: employee.employeeName,
      phone: employee.phone,
      email: employee.email,
      createdBy: actorId,
      isActive: employee.isActive !== false
    });
  }
  return null;
};

// Loads the employee and checks the caller manages its store (admin: any, executive: assigned stores)
const loadManagedEmployee = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).send({ error: 'Employee not found' });
    return null;
  }
  const employee = await Employee.findById(req.params.id);
  if (!employee || !(await canAccessStore(req.user, employee.storeId))) {
    res.status(404).send({ error: 'Employee not found' });
    return null;
  }
  return employee;
};

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

// Get all employees for a specific store (only within the caller's scope)
router.get('/store/:storeId', auth, async (req, res) => {
  try {
    if (!(await canAccessStore(req.user, req.params.storeId))) {
      return res.status(404).send({ error: 'Store not found' });
    }
    const employees = await Employee.find({ storeId: req.params.storeId }).sort({ createdAt: -1 });
    res.send(req.user.role === 'MINI_STORE' ? employees : await withLogins(employees));
  } catch (error) {
    console.error('Error fetching store employees:', error);
    res.status(500).send({ error: 'Server error fetching employees' });
  }
});

// Admin / Executive: Add a new employee (optionally with a login) to a store they manage
router.post('/store/:storeId', auth, authorizeRoles('ADMIN', 'EXECUTIVE'), async (req, res) => {
  try {
    const { storeId } = req.params;
    const { employeeName, designation, phone, email, address, status, employeeId, username, password } = req.body;

    if (!(await canAccessStore(req.user, storeId))) {
      return res.status(404).send({ error: 'Store not found' });
    }
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
      for (let n = count + 1; ; n += 1) {
        empCode = `EMP-${store.storeCode}-${String(n).padStart(2, '0')}`;
        // eslint-disable-next-line no-await-in-loop
        if (!(await Employee.exists({ storeId, employeeId: empCode }))) break;
      }
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

    const loginError = await upsertLogin(employee, { username, password }, req.user._id);
    if (loginError) {
      await Employee.findByIdAndDelete(employee._id);
      return res.status(400).send({ error: loginError });
    }

    res.status(201).send((await withLogins([employee]))[0]);
  } catch (error) {
    console.error('Error adding employee:', error);
    res.status(500).send({ error: 'Server error adding employee' });
  }
});

// Admin / Executive: Edit employee details and login
router.put('/:id', auth, authorizeRoles('ADMIN', 'EXECUTIVE'), async (req, res) => {
  try {
    const current = await loadManagedEmployee(req, res);
    if (!current) return;

    const { status, isActive, username, password } = req.body;
    const allowed = ['employeeName', 'designation', 'phone', 'email', 'address', 'employeeId'];
    const updateData = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) updateData[k] = req.body[k]; });
    if (status !== undefined) {
      updateData.status = status;
      updateData.isActive = status === 'Active';
    } else if (isActive !== undefined) {
      updateData.isActive = isActive;
      updateData.status = isActive ? 'Active' : 'Inactive';
    }

    const employee = await Employee.findByIdAndUpdate(current._id, updateData, { new: true, runValidators: true });

    const loginError = await upsertLogin(employee, { username, password }, req.user._id);
    if (loginError) {
      return res.status(400).send({ error: loginError });
    }
    await User.updateMany(
      { employeeId: employee._id },
      { name: employee.employeeName, isActive: employee.isActive !== false }
    );

    res.send((await withLogins([employee]))[0]);
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).send({ error: 'Server error updating employee' });
  }
});

// Admin / Executive: Toggle Employee active/inactive status (login follows)
router.put('/:id/status', auth, authorizeRoles('ADMIN', 'EXECUTIVE'), async (req, res) => {
  try {
    const current = await loadManagedEmployee(req, res);
    if (!current) return;

    const { status, isActive } = req.body;
    const newStatus = status || (isActive ? 'Active' : 'Inactive');
    const newIsActive = newStatus === 'Active';

    const employee = await Employee.findByIdAndUpdate(
      current._id,
      { status: newStatus, isActive: newIsActive },
      { new: true }
    );
    await User.updateMany({ employeeId: employee._id }, { isActive: newIsActive });

    res.send((await withLogins([employee]))[0]);
  } catch (error) {
    console.error('Error updating employee status:', error);
    res.status(500).send({ error: 'Server error updating employee status' });
  }
});

// Admin / Executive: Delete Employee and their login
router.delete('/:id', auth, authorizeRoles('ADMIN', 'EXECUTIVE'), async (req, res) => {
  try {
    const current = await loadManagedEmployee(req, res);
    if (!current) return;
    await Employee.findByIdAndDelete(current._id);
    await User.deleteMany({ employeeId: current._id });
    res.send({ message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).send({ error: 'Server error deleting employee' });
  }
});

module.exports = router;
