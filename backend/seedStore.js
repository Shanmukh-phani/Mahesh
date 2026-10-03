const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();
const User = require('./models/User');
const Store = require('./models/Store');

const seedStore = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/medical_mini_store';
    await mongoose.connect(MONGODB_URI);

    const storeExists = await Store.findOne({ storeCode: 'MS001' });
    if (!storeExists) {
      const store = new Store({
        storeCode: 'MS001',
        storeName: 'Mini Store 1',
        location: 'Downtown',
      });
      await store.save();

      const passwordHash = await bcrypt.hash('store123', 10);
      const user = new User({
        username: 'store1',
        passwordHash,
        role: 'MINI_STORE',
        storeId: store._id,
        name: 'Mini Store 1',
      });
      await user.save();
      console.log('Store seeded. Username: store1, Password: store123');
    } else {
      console.log('Store already exists.');
    }
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.disconnect();
  }
};

seedStore();
