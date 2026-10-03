const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

const User = require('./models/User');
const Store = require('./models/Store');
const Employee = require('./models/Employee');
const Medicine = require('./models/Medicine');
const MedicineRequest = require('./models/MedicineRequest');
const MainInventory = require('./models/MainInventory');
const StoreInventory = require('./models/StoreInventory');
const Customer = require('./models/Customer');
const Notification = require('./models/Notification');

const resetDatabase = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/medical_mini_store';
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB. Wiping existing data...');

    // Delete all documents from all collections
    await User.deleteMany({});
    await Store.deleteMany({});
    await Employee.deleteMany({});
    await Medicine.deleteMany({});
    await MedicineRequest.deleteMany({});
    await MainInventory.deleteMany({});
    await StoreInventory.deleteMany({});
    await Customer.deleteMany({});
    await Notification.deleteMany({});

    console.log('All collection data completely removed.');

    // Seed ONLY Admin User
    const passwordHash = await bcrypt.hash('admin123', 10);
    const admin = new User({
      username: 'admin',
      passwordHash,
      role: 'ADMIN',
      name: 'Main Branch Admin',
      email: 'admin@medconnect.com'
    });
    await admin.save();

    console.log('==============================================');
    console.log(' DATABASE RESET COMPLETED SUCCESSFULY! ');
    console.log(' Only Admin credentials exist:');
    console.log(' Username: admin');
    console.log(' Password: admin123');
    console.log(' Role: ADMIN');
    console.log('==============================================');

  } catch (error) {
    console.error('Error resetting database:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

resetDatabase();
