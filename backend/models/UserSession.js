const mongoose = require('mongoose');

// One login = one session. Duration = (logoutAt || lastSeenAt) - loginAt; activeMs = time the app tab was visible.
const userSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: String,
  name: String,
  role: String,
  adminLevel: String,
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  storeCode: String,
  storeName: String,
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },

  loginAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  lastHeartbeatAt: Date,
  logoutAt: Date,
  // LOGOUT = user signed out, FORCED = ended by an admin / executive, EXISTING_LOGIN = started from a token issued before logging existed
  endReason: String,
  endedBy: String,
  startedFrom: { type: String, default: 'LOGIN' },
  tokenKey: { type: String, index: true },

  activeMs: { type: Number, default: 0 },
  pageViews: { type: Number, default: 0 },
  actions: { type: Number, default: 0 },
  lastPath: String,

  ip: String,
  userAgent: String,
  device: String
}, { versionKey: false });

userSessionSchema.index({ userId: 1, loginAt: -1 });
userSessionSchema.index({ loginAt: -1 });
userSessionSchema.index({ storeId: 1, loginAt: -1 });
userSessionSchema.index({ lastSeenAt: -1 });

module.exports = mongoose.model('UserSession', userSessionSchema);
