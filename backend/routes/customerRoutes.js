const express = require('express');
const { auth, authorizeRoles } = require('../middleware/auth');
const Customer = require('../models/Customer');
const MedicineRequest = require('../models/MedicineRequest');
const { storeScopeFilter } = require('../utils/access');

const router = express.Router();

// Get all customers (Admin / Mini Store)
router.get('/', auth, async (req, res) => {
  try {
    const { search, status } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (status) {
      query.status = status;
    }

    const customers = await Customer.find(query).sort({ updatedAt: -1 });
    res.send(customers);
  } catch (error) {
    res.status(500).send({ error: 'Server error' });
  }
});

// Add new customer
router.post('/', auth, async (req, res) => {
  try {
    const { name, phone, email, address, notes, status } = req.body;
    
    const existing = await Customer.findOne({ phone });
    if (existing) {
      return res.status(400).send({ error: 'Customer with this phone number already exists' });
    }

    const customer = new Customer({ name, phone, email, address, notes, status });
    await customer.save();
    res.status(201).send(customer);
  } catch (error) {
    res.status(500).send({ error: 'Failed to create customer' });
  }
});

// Update customer
router.put('/:id', auth, async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!customer) {
      return res.status(404).send({ error: 'Customer not found' });
    }
    res.send(customer);
  } catch (error) {
    res.status(500).send({ error: 'Failed to update customer' });
  }
});

// Get customer request history
router.get('/:id/history', auth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).send({ error: 'Customer not found' });
    }

    const requests = await MedicineRequest.find({ 'customer.phone': customer.phone, ...(await storeScopeFilter(req.user)) })
      .populate('storeId', 'storeName storeCode')
      .sort({ createdAt: -1 });

    res.send({ customer, requests });
  } catch (error) {
    res.status(500).send({ error: 'Server error' });
  }
});

module.exports = router;
