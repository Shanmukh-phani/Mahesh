const mongoose = require('mongoose');

// One row per thing that happened in the app (who / what / when / where / what changed)
const changeSchema = new mongoose.Schema({
  field: String,
  from: mongoose.Schema.Types.Mixed,
  to: mongoose.Schema.Types.Mixed
}, { _id: false });

const activityLogSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },

  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorName: String,
  actorUsername: String,
  actorRole: { type: String }, // ADMIN | EXECUTIVE | MINI_STORE | SYSTEM | GUEST
  adminLevel: String,
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  designation: String,

  // Store the action relates to (actor's store for store users, otherwise the affected record's store)
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  storeCode: String,
  storeName: String,

  category: { type: String, required: true }, // AUTH, SESSION, REQUEST, COMPLAINT, INVENTORY, STORE, EMPLOYEE, USER, CUSTOMER, MEDICINE, NOTIFICATION, NAVIGATION, EXPORT, SYSTEM
  action: { type: String, required: true },
  outcome: { type: String, enum: ['SUCCESS', 'FAILED'], default: 'SUCCESS' },
  summary: String,

  entity: String,
  entityId: String,
  entityLabel: String,
  changes: [changeSchema],
  details: mongoose.Schema.Types.Mixed,

  source: { type: String, default: 'WEB' }, // WEB | AI_ASSISTANT | SERVER
  method: String,
  path: String,
  statusCode: Number,
  durationMs: Number,
  errorMessage: String,

  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserSession' },
  ip: String,
  userAgent: String,
  device: String
}, { versionKey: false });

activityLogSchema.index({ at: -1 });
activityLogSchema.index({ actorId: 1, at: -1 });
activityLogSchema.index({ storeId: 1, at: -1 });
activityLogSchema.index({ category: 1, at: -1 });
activityLogSchema.index({ actorRole: 1, at: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
