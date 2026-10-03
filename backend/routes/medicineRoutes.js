const express = require('express');
const { auth, authorizeRoles } = require('../middleware/auth');
const Medicine = require('../models/Medicine');
const MainInventory = require('../models/MainInventory');

const router = express.Router();

// Get all medicines (Admin/Mini Store)
router.get('/', auth, async (req, res) => {
  try {
    const search = req.query.search;
    let query = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { genericName: { $regex: search, $options: 'i' } }
        ]
      };
    }
    const medicines = await Medicine.find(query).limit(50);
    res.send(medicines);
  } catch (error) {
    res.status(500).send({ error: 'Server error' });
  }
});

// Admin: Add new medicine
router.post('/', auth, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const medicine = new Medicine(req.body);
    await medicine.save();
    
    // Auto-create MainInventory record with 0 quantity
    const mainInv = new MainInventory({ medicineId: medicine._id, quantity: 0 });
    await mainInv.save();
    
    res.status(201).send(medicine);
  } catch (error) {
    res.status(400).send({ error: 'Error creating medicine' });
  }
});

module.exports = router;
