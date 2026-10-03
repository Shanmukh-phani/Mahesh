const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();
const User = require('./models/User');

const seedAdmin = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/medical_mini_store';
    await mongoose.connect(MONGODB_URI);

    const adminExists = await User.findOne({ role: 'ADMIN' });
    if (!adminExists) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      const admin = new User({
        username: 'admin',
        passwordHash,
        role: 'ADMIN',
        name: 'Super Admin',
      });
      await admin.save();
      console.log('Admin user seeded. Username: admin, Password: admin123');
    } else {
      console.log('Admin already exists.');
    }
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.disconnect();
  }
};

seedAdmin();
