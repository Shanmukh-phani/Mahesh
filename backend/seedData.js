const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();
const User = require('./models/User');
const Store = require('./models/Store');
const Medicine = require('./models/Medicine');
const MedicineRequest = require('./models/MedicineRequest');
const MainInventory = require('./models/MainInventory');
const Customer = require('./models/Customer');
const Notification = require('./models/Notification');

const seedData = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/medical_mini_store';
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB for seeding...');

    // 0. Create Admin User if not present
    let admin = await User.findOne({ role: 'ADMIN' });
    if (!admin) {
      const hash = await bcrypt.hash('admin123', 10);
      admin = new User({
        username: 'admin',
        passwordHash: hash,
        role: 'ADMIN',
        name: 'Central Warehouse Admin'
      });
      await admin.save();
      console.log('Admin user seeded (admin / admin123).');
    }

    // 1. Create Mini Stores & Users
    const storesData = [
      { code: 'MS001', name: 'Mini Store 1 (Hitech City)', user: 'store1', phone: '9876543210' },
      { code: 'MS002', name: 'Mini Store 2 (Jubilee Hills)', user: 'store2', phone: '9876543211' },
      { code: 'MS003', name: 'Mini Store 3 (Banjara Hills)', user: 'store3', phone: '9876543212' },
      { code: 'MS004', name: 'Mini Store 4 (Madhapur)', user: 'store4', phone: '9876543213' },
      { code: 'MS005', name: 'Mini Store 5 (Kondapur)', user: 'store5', phone: '9876543214' },
    ];

    let storeDocs = [];
    for (let s of storesData) {
      let store = await Store.findOne({ storeCode: s.code });
      if (!store) {
        store = new Store({
          storeCode: s.code,
          storeName: s.name,
          location: 'Hyderabad',
          contactPerson: 'Manager ' + s.code,
          phone: s.phone,
          email: `${s.user}@medministore.com`
        });
        await store.save();

        const hash = await bcrypt.hash('store123', 10);
        const user = new User({
          username: s.user,
          passwordHash: hash,
          role: 'MINI_STORE',
          storeId: store._id,
          name: s.name,
          email: `${s.user}@medministore.com`
        });
        await user.save();
      }
      storeDocs.push(store);
    }
    console.log('Stores & Store Managers seeded.');

    // 2. Create Medicines & Main Inventory
    const medicinesData = [
      { name: 'Dolo 650', genericName: 'Paracetamol', category: 'Pain Relief', stock: 450, reorder: 50 },
      { name: 'Cetirizine 10mg', genericName: 'Cetirizine HCL', category: 'Allergy', stock: 320, reorder: 40 },
      { name: 'Pantoprazole 40mg', genericName: 'Pantoprazole', category: 'Antacid', stock: 280, reorder: 30 },
      { name: 'Amoxicillin 500mg', genericName: 'Amoxicillin', category: 'Antibiotic', stock: 150, reorder: 50 },
      { name: 'Azithromycin 500mg', genericName: 'Azithromycin', category: 'Antibiotic', stock: 90, reorder: 40 },
      { name: 'Vitamin C + Zinc', genericName: 'Ascorbic Acid', category: 'Vitamins', stock: 600, reorder: 100 },
      { name: 'Aspirin 75mg', genericName: 'Aspirin', category: 'Cardiology', stock: 180, reorder: 30 },
      { name: 'Metformin 500mg', genericName: 'Metformin', category: 'Diabetes', stock: 220, reorder: 40 },
      { name: 'Atorvastatin 10mg', genericName: 'Atorvastatin', category: 'Cardiology', stock: 35, reorder: 50 }, // Low stock!
      { name: 'Ibuprofen 400mg', genericName: 'Ibuprofen', category: 'Pain Relief', stock: 500, reorder: 60 }
    ];

    let medDocs = [];
    for (let m of medicinesData) {
      let med = await Medicine.findOne({ name: m.name });
      if (!med) {
        med = new Medicine({
          name: m.name,
          genericName: m.genericName,
          category: m.category,
          manufacturer: 'PharmaCorp Global',
          description: `Standard dosage formulation for ${m.category.toLowerCase()} treatments.`
        });
        await med.save();

        const mainInv = new MainInventory({
          medicineId: med._id,
          quantity: m.stock,
          batchNumber: `BAT-${Math.floor(100000 + Math.random() * 900000)}`,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          minReorderLevel: m.reorder
        });
        await mainInv.save();
      }
      medDocs.push(med);
    }
    console.log('Medicines & Main Warehouse Inventory seeded.');

    // 3. Create Customers
    const customerSamples = [
      { name: 'Rahul Sharma', phone: '9876511111', email: 'rahul.s@example.com', address: 'Jubilee Hills, Road No 36' },
      { name: 'Priya Verma', phone: '9876522222', email: 'priya.v@example.com', address: 'Hitech City, Madhapur' },
      { name: 'Arun Kumar', phone: '9876533333', email: 'arun.k@example.com', address: 'Banjara Hills, Road 12' },
      { name: 'Sneha Reddy', phone: '9876544444', email: 'sneha.r@example.com', address: 'Kondapur, Green Glen' },
      { name: 'Ravi Teja', phone: '9876555555', email: 'ravi.t@example.com', address: 'Gachibowli, Financial District' },
      { name: 'Kavya Rao', phone: '9876566666', email: 'kavya.r@example.com', address: 'Kukatpally, Phase 3' },
    ];

    for (let cust of customerSamples) {
      const existing = await Customer.findOne({ phone: cust.phone });
      if (!existing) {
        await Customer.create({
          ...cust,
          totalRequests: Math.floor(Math.random() * 8) + 1,
          status: 'Active'
        });
      }
    }
    console.log('Customers seeded.');

    // 4. Create Medicine Requests if few exist
    const reqCount = await MedicineRequest.countDocuments();
    if (reqCount < 15) {
      const statuses = ['Pending', 'Completed', 'Approved / Will Be Supplied', 'Ordered', 'Not Available'];
      const custs = await Customer.find();
      
      for (let i = 0; i < 30; i++) {
        const randomStore = storeDocs[Math.floor(Math.random() * storeDocs.length)];
        const randomMed = medDocs[Math.floor(Math.random() * medDocs.length)];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        const randomCust = custs[Math.floor(Math.random() * custs.length)];
        
        const date = new Date();
        date.setDate(date.getDate() - Math.floor(Math.random() * 25));

        const reqDoc = new MedicineRequest({
          requestId: `MR-${10000 + i + 1}`,
          storeId: randomStore._id,
          medicineId: randomMed._id,
          medicineName: randomMed.name,
          quantity: Math.floor(Math.random() * 8) + 1,
          customer: {
            name: randomCust.name,
            phone: randomCust.phone,
            email: randomCust.email
          },
          status: randomStatus,
          createdAt: date,
        });
        await reqDoc.save();
      }
      console.log('30 Medicine Requests seeded.');
    }

    // 5. Seed Notifications
    const notifCount = await Notification.countDocuments();
    if (notifCount < 5) {
      await Notification.create([
        {
          recipientRole: 'ADMIN',
          type: 'LOW_STOCK',
          title: 'Low Stock Alert',
          message: 'Atorvastatin 10mg is below reorder level (35 units left in Main Inventory).'
        },
        {
          recipientRole: 'ADMIN',
          type: 'NEW_REQUEST',
          title: 'Urgent Request',
          message: 'Mini Store 1 (Hitech City) requested 10 units of Dolo 650.'
        },
        {
          recipientRole: 'MINI_STORE',
          recipientStoreId: storeDocs[0]._id,
          type: 'STATUS_UPDATE',
          title: 'Request Approved',
          message: 'Request MR-10001 for Dolo 650 is approved and ready for dispatch.'
        }
      ]);
      console.log('Notifications seeded.');
    }

    console.log('Seed process finished successfully!');
  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    mongoose.disconnect();
  }
};

seedData();
