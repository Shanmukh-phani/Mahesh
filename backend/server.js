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
const complaintRoutes = require('./routes/complaintRoutes');
const userRoutes = require('./routes/userRoutes');
const activityRoutes = require('./routes/activityRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const { startExpenseReminders } = require('./utils/expenseReminders');
const activityLogger = require('./middleware/activityLogger');
const ActivityLog = require('./models/ActivityLog');
const { logActivity, serverStartedAt, formatDuration } = require('./utils/activity');
const runHierarchyMigration = require('./migrations/hierarchy');
const setupSocket = require('./socket');

const app = express();
const server = http.createServer(app);
const io = setupSocket(server);

// Make io accessible to routes
app.set('io', io);

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(activityLogger);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/users', userRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/expenses', expenseRoutes);

const PORT = process.env.PORT || 5001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/medical_mini_store';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    try {
      await runHierarchyMigration();
    } catch (err) {
      console.error('[migration] hierarchy migration failed:', err);
    }
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT} (LAN accessible)`);
      logActivity({
        category: 'SYSTEM',
        action: 'SERVER_START',
        actorRole: 'SYSTEM',
        actorName: 'Server',
        summary: `Server started on port ${PORT}`,
        details: { pid: process.pid, node: process.version, port: Number(PORT) }
      });
      startExpenseReminders(io);
    });
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
  });

// Record shutdowns so admins can see when the app was down / restarted
let stopping = false;
const logStop = async (signal) => {
  if (stopping) return;
  stopping = true;
  const uptimeMs = Date.now() - serverStartedAt.getTime();
  try {
    await Promise.race([
      ActivityLog.create({
        category: 'SYSTEM',
        action: 'SERVER_STOP',
        actorRole: 'SYSTEM',
        actorName: 'Server',
        source: 'SERVER',
        summary: `Server stopped (${signal}) after running ${formatDuration(uptimeMs)}`,
        details: { signal, uptimeMs, pid: process.pid }
      }),
      new Promise((resolve) => setTimeout(resolve, 1500))
    ]);
  } catch {
    /* shutting down anyway */
  }
};
['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.once(signal, async () => {
    await logStop(signal);
    process.exit(0);
  });
});
// nodemon restarts with SIGUSR2
process.once('SIGUSR2', async () => {
  await logStop('restart');
  process.kill(process.pid, 'SIGUSR2');
});
