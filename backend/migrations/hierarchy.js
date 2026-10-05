const User = require('../models/User');
const Store = require('../models/Store');
const Employee = require('../models/Employee');
const MedicineRequest = require('../models/MedicineRequest');

const nextEmployeeCode = async (store) => {
  const count = await Employee.countDocuments({ storeId: store._id });
  for (let n = count + 1; ; n += 1) {
    const code = `EMP-${store.storeCode}-${String(n).padStart(2, '0')}`;
    // eslint-disable-next-line no-await-in-loop
    if (!(await Employee.exists({ storeId: store._id, employeeId: code }))) return code;
  }
};

/**
 * Idempotent; runs on every server start.
 * - Existing admins become the MAIN admin.
 * - Old shared store logins become the Store Manager's personal login (so nobody is locked out).
 * - Requests created before two-step approval count as already approved by the executive.
 */
const runHierarchyMigration = async () => {
  const admins = await User.updateMany({ role: 'ADMIN', adminLevel: { $exists: false } }, { $set: { adminLevel: 'MAIN' } });

  let linked = 0;
  const sharedLogins = await User.find({ role: 'MINI_STORE', employeeId: { $exists: false } });
  for (const user of sharedLogins) {
    // eslint-disable-next-line no-await-in-loop
    const store = user.storeId ? await Store.findById(user.storeId) : null;
    if (!store) continue;
    // eslint-disable-next-line no-await-in-loop
    const takenIds = (await User.find({ storeId: store._id, employeeId: { $exists: true } }, 'employeeId').lean()).map((u) => u.employeeId);
    // eslint-disable-next-line no-await-in-loop
    let manager = await Employee.findOne({ storeId: store._id, designation: 'Store Manager', _id: { $nin: takenIds } });
    if (!manager) {
      // eslint-disable-next-line no-await-in-loop
      manager = await Employee.create({
        employeeId: await nextEmployeeCode(store),
        storeId: store._id,
        storeCode: store.storeCode,
        employeeName: store.contactPerson || `${store.storeName} Manager`,
        designation: 'Store Manager',
        phone: store.managerPhone || store.phone || '',
        email: store.managerEmail || store.email || '',
        status: store.isActive === false ? 'Inactive' : 'Active'
      });
    }
    user.employeeId = manager._id;
    user.name = manager.employeeName;
    // eslint-disable-next-line no-await-in-loop
    await user.save();
    linked += 1;
  }

  const requests = await MedicineRequest.updateMany({ approvalStage: { $exists: false } }, { $set: { approvalStage: 'FORWARDED' } });

  if (admins.modifiedCount || linked || requests.modifiedCount) {
    console.log(`[migration] admins→MAIN: ${admins.modifiedCount}, store logins linked to managers: ${linked}, requests marked forwarded: ${requests.modifiedCount}`);
  }
};

module.exports = runHierarchyMigration;
