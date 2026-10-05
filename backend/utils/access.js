const mongoose = require('mongoose');
const Store = require('../models/Store');

const isMainAdmin = (user) => user?.role === 'ADMIN' && user.adminLevel !== 'SUB';

// Display name used in audit trails / notifications, e.g. "Admin A (Admin)" or "Ravi (Executive)"
const actorLabel = (user) => {
  const name = user?.employeeName || user?.name || user?.username || 'Unknown';
  if (user?.role === 'ADMIN') return `${name} (${user.adminLevel === 'SUB' ? 'Admin' : 'Main Admin'})`;
  if (user?.role === 'EXECUTIVE') return `${name} (Executive)`;
  return name;
};

const actorName = (user) => user?.employeeName || user?.name || user?.username || 'Unknown';

/**
 * Store ids the user may see: null = every store (ADMIN), otherwise an array of id strings.
 */
const scopedStoreIds = async (user) => {
  if (user?.role === 'ADMIN') return null;
  if (user?.role === 'EXECUTIVE') {
    const stores = await Store.find({ executiveId: user._id }, '_id').lean();
    return stores.map((s) => String(s._id));
  }
  return user?.storeId ? [String(user.storeId)] : [];
};

const canAccessStore = async (user, storeId) => {
  if (!storeId || !mongoose.isValidObjectId(String(storeId))) return false;
  const ids = await scopedStoreIds(user);
  return ids === null || ids.includes(String(storeId));
};

// Mongo filter on storeId for the user's scope; {} for admins. ObjectIds so it also works in aggregate $match.
const storeScopeFilter = async (user, field = 'storeId') => {
  const ids = await scopedStoreIds(user);
  return ids === null ? {} : { [field]: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } };
};

// Requests the main branch works on: hidden while waiting for / rejected by the executive
const MAIN_BRANCH_VISIBLE = { approvalStage: { $nin: ['PENDING_EXECUTIVE', 'REJECTED_BY_EXECUTIVE'] } };

const executiveRoom = (userId) => `EXEC_${String(userId)}`;

module.exports = {
  isMainAdmin, actorLabel, actorName, scopedStoreIds, canAccessStore, storeScopeFilter, MAIN_BRANCH_VISIBLE, executiveRoom
};
