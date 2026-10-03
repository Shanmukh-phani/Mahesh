const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const storeRoutes = require('./routes/storeRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const requestRoutes = require('./routes/requestRoutes');
const medicineRoutes = require('./routes/medicineRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const customerRoutes = require('./routes/customerRoutes');
const setupSocket = require('./socket');

const app = express();
const server = http.createServer(app);
const io = setupSocket(server);

// Make io accessible to routes
app.set('io', io);

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/customers', customerRoutes);

const PORT = process.env.PORT || 5001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/medical_mini_store';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT} (LAN accessible)`);
    });
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
  });
