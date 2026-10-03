const express = require('express');
const { auth, authorizeRoles } = require('../middleware/auth');
const MainInventory = require('../models/MainInventory');
const StoreInventory = require('../models/StoreInventory');
const Medicine = require('../models/Medicine');

const router = express.Router();

// Get main inventory with category & search filter (Admin / Mini Store)
router.get('/main', auth, async (req, res) => {
  try {
    const { search, category } = req.query;
    let inventory = await MainInventory.find().populate('medicineId');

    if (search) {
      const query = search.toLowerCase();
      inventory = inventory.filter(item => 
        item.medicineId?.name?.toLowerCase().includes(query) ||
        item.medicineId?.genericName?.toLowerCase().includes(query) ||
        item.batchNumber?.toLowerCase().includes(query)
      );
    }

    if (category) {
      inventory = inventory.filter(item => item.medicineId?.category === category);
    }

    res.send(inventory);
  } catch (error) {
    res.status(500).send({ error: 'Server error' });
  }
});

// Admin: Update main inventory batch
router.put('/main/:id', auth, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { quantity, batchNumber, expiryDate, minReorderLevel, unitPrice } = req.body;
    const inventory = await MainInventory.findByIdAndUpdate(
      req.params.id,
      { quantity, batchNumber, expiryDate, minReorderLevel, unitPrice },
      { new: true }
    ).populate('medicineId');
    res.send(inventory);
  } catch (error) {
    res.status(500).send({ error: 'Server error' });
  }
});

// Admin: Add new medicine & initialize Main Inventory
router.post('/main/add-medicine', auth, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { name, genericName, category, manufacturer, description, quantity, batchNumber, expiryDate, minReorderLevel } = req.body;

    let medicine = await Medicine.findOne({ name });
    if (!medicine) {
      medicine = new Medicine({ name, genericName, category, manufacturer, description });
      await medicine.save();
    }

    let mainInv = await MainInventory.findOne({ medicineId: medicine._id });
    if (mainInv) {
      mainInv.quantity += Number(quantity || 0);
      if (batchNumber) mainInv.batchNumber = batchNumber;
      if (expiryDate) mainInv.expiryDate = expiryDate;
      if (minReorderLevel) mainInv.minReorderLevel = minReorderLevel;
      await mainInv.save();
    } else {
      mainInv = new MainInventory({
        medicineId: medicine._id,
        quantity: Number(quantity || 0),
        batchNumber: batchNumber || `BATCH-${Math.floor(Math.random() * 90000 + 10000)}`,
        expiryDate: expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        minReorderLevel: minReorderLevel || 50
      });
      await mainInv.save();
    }

    await mainInv.populate('medicineId');
    res.status(201).send(mainInv);
  } catch (error) {
    console.error('Error adding main inventory:', error);
    res.status(500).send({ error: 'Failed to add item to main inventory' });
  }
});

// Mini Store: Get store inventory
router.get('/store', auth, async (req, res) => {
  try {
    const storeId = req.user.storeId || req.query.storeId;
    const inventory = await StoreInventory.find({ storeId }).populate('medicineId');
    res.send(inventory);
  } catch (error) {
    res.status(500).send({ error: 'Server error' });
  }
});

// Mini Store: Add/Update store inventory
router.post('/store', auth, authorizeRoles('MINI_STORE'), async (req, res) => {
  try {
    const { medicineId, quantity, batchNumber, expiryDate } = req.body;
    let inventoryItem = await StoreInventory.findOne({ storeId: req.user.storeId, medicineId });

    if (inventoryItem) {
      inventoryItem.quantity = quantity;
      if (batchNumber) inventoryItem.batchNumber = batchNumber;
      if (expiryDate) inventoryItem.expiryDate = expiryDate;
      await inventoryItem.save();
    } else {
      inventoryItem = new StoreInventory({
        storeId: req.user.storeId,
        medicineId,
        quantity,
        batchNumber,
        expiryDate
      });
      await inventoryItem.save();
    }
    
    await inventoryItem.populate('medicineId');
    res.send(inventoryItem);
  } catch (error) {
    res.status(500).send({ error: 'Server error' });
  }
});

// ---------- Bulk upload (CSV / Excel parsed on the client) ----------

const MAX_BULK_ROWS = 5000;

const cleanText = (value) => (value === undefined || value === null ? '' : String(value).trim());

const parseBulkRow = (raw = {}) => {
  const name = cleanText(raw.name);
  const qtyText = cleanText(raw.quantity);
  const quantity = qtyText === '' ? NaN : Number(qtyText);
  let expiryDate;
  if (cleanText(raw.expiryDate)) {
    const d = new Date(raw.expiryDate);
    if (!Number.isNaN(d.getTime())) expiryDate = d;
  }
  return {
    name,
    genericName: cleanText(raw.genericName),
    category: cleanText(raw.category),
    description: cleanText(raw.description),
    batchNumber: cleanText(raw.batchNumber),
    quantity,
    expiryDate
  };
};

const rowError = (row) => {
  if (!row.name) return 'Medicine name is missing';
  if (!Number.isFinite(row.quantity)) return 'Quantity must be a number';
  if (row.quantity < 0) return 'Quantity cannot be negative';
  return '';
};

const loadMedicineMap = async () => {
  const medicines = await Medicine.find({}, 'name genericName category description');
  const map = new Map();
  medicines.forEach((m) => {
    if (m.name) map.set(m.name.trim().toLowerCase(), m);
  });
  return map;
};

const validateBulkBody = (req, res) => {
  const { rows } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).send({ error: 'No rows to upload' });
    return null;
  }
  if (rows.length > MAX_BULK_ROWS) {
    res.status(400).send({ error: `Too many rows. Upload up to ${MAX_BULK_ROWS} rows at a time.` });
    return null;
  }
  return { rows, mode: req.body.mode === 'add' ? 'add' : 'replace' };
};

// Admin: bulk upsert warehouse stock. Unknown medicines are added to the catalog.
router.post('/main/bulk', auth, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const body = validateBulkBody(req, res);
    if (!body) return;
    const { rows, mode } = body;

    const medicineMap = await loadMedicineMap();
    const summary = { total: rows.length, created: 0, updated: 0, newMedicines: 0, skipped: [] };

    for (let i = 0; i < rows.length; i += 1) {
      const row = parseBulkRow(rows[i]);
      const err = rowError(row);
      if (err) {
        summary.skipped.push({ row: Number(rows[i]?._row) || i + 2, name: row.name, reason: err });
        continue;
      }

      const key = row.name.toLowerCase();
      let medicine = medicineMap.get(key);
      if (!medicine) {
        medicine = await Medicine.create({
          name: row.name,
          genericName: row.genericName || undefined,
          category: row.category || undefined,
          description: row.description || undefined
        });
        medicineMap.set(key, medicine);
        summary.newMedicines += 1;
      } else {
        let changed = false;
        if (!medicine.genericName && row.genericName) { medicine.genericName = row.genericName; changed = true; }
        if (!medicine.category && row.category) { medicine.category = row.category; changed = true; }
        if (!medicine.description && row.description) { medicine.description = row.description; changed = true; }
        if (changed) await medicine.save();
      }

      const existing = await MainInventory.findOne({ medicineId: medicine._id });
      if (existing) {
        existing.quantity = mode === 'add' ? Number(existing.quantity || 0) + row.quantity : row.quantity;
        if (row.batchNumber) existing.batchNumber = row.batchNumber;
        if (row.expiryDate) existing.expiryDate = row.expiryDate;
        await existing.save();
        summary.updated += 1;
      } else {
        await MainInventory.create({
          medicineId: medicine._id,
          quantity: row.quantity,
          batchNumber: row.batchNumber || undefined,
          expiryDate: row.expiryDate
        });
        summary.created += 1;
      }
    }

    res.send(summary);
  } catch (error) {
    console.error('Bulk main inventory upload error:', error);
    res.status(500).send({ error: 'Bulk upload failed' });
  }
});

// Mini Store: bulk upsert shelf stock for the logged-in store. Medicines must exist in the catalog.
router.post('/store/bulk', auth, authorizeRoles('MINI_STORE'), async (req, res) => {
  try {
    const storeId = req.user.storeId;
    if (!storeId) return res.status(400).send({ error: 'Store not linked to this login' });

    const body = validateBulkBody(req, res);
    if (!body) return;
    const { rows, mode } = body;

    const medicineMap = await loadMedicineMap();
    const summary = { total: rows.length, created: 0, updated: 0, newMedicines: 0, skipped: [] };

    for (let i = 0; i < rows.length; i += 1) {
      const row = parseBulkRow(rows[i]);
      const err = rowError(row);
      if (err) {
        summary.skipped.push({ row: Number(rows[i]?._row) || i + 2, name: row.name, reason: err });
        continue;
      }

      const medicine = medicineMap.get(row.name.toLowerCase());
      if (!medicine) {
        summary.skipped.push({ row: Number(rows[i]?._row) || i + 2, name: row.name, reason: 'Not found in medicine catalog' });
        continue;
      }

      const existing = await StoreInventory.findOne({ storeId, medicineId: medicine._id });
      if (existing) {
        existing.quantity = mode === 'add' ? Number(existing.quantity || 0) + row.quantity : row.quantity;
        if (row.batchNumber) existing.batchNumber = row.batchNumber;
        if (row.expiryDate) existing.expiryDate = row.expiryDate;
        await existing.save();
        summary.updated += 1;
      } else {
        await StoreInventory.create({
          storeId,
          medicineId: medicine._id,
          quantity: row.quantity,
          batchNumber: row.batchNumber || undefined,
          expiryDate: row.expiryDate
        });
        summary.created += 1;
      }
    }

    res.send(summary);
  } catch (error) {
    console.error('Bulk store inventory upload error:', error);
    res.status(500).send({ error: 'Bulk upload failed' });
  }
});

module.exports = router;
