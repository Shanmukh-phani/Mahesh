const Store = require('../models/Store');
const StoreExpense = require('../models/StoreExpense');
const Notification = require('../models/Notification');

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const previousMonthKey = (d = new Date()) => monthKey(new Date(d.getFullYear(), d.getMonth() - 1, 1));
const monthLabel = (key) => {
  const [y, m] = String(key).split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
};

// From this day of the month, stores with no expenses yet are reminded; in the first days they are reminded about last month
const MONTH_END_FROM_DAY = 25;
const MONTH_START_UNTIL_DAY = 5;

const notifyStore = async (io, store, { type, title, message, code }) => {
  const notification = await Notification.create({
    recipientStoreId: store._id,
    type,
    title,
    message,
    storeCode: store.storeCode,
    storeName: store.storeName,
    requestCode: code
  });
  if (io) io.to(`STORE_${store._id}`).emit('new_notification', notification);
  return notification;
};

// Goes to the store's executive officer; stores without one notify the admins instead
const notifyExecutive = async (io, store, { type, title, message, code }) => {
  const base = { type, title, message, storeCode: store.storeCode, storeName: store.storeName, requestCode: code };
  if (store.executiveId) {
    const notification = await Notification.create({ ...base, recipientRole: 'EXECUTIVE', recipientUserId: store.executiveId });
    if (io) io.to(`EXEC_${store.executiveId}`).emit('new_notification', notification);
    return notification;
  }
  const notification = await Notification.create({ ...base, recipientRole: 'ADMIN' });
  if (io) io.to('ADMIN_ROOM').emit('new_notification', notification);
  return notification;
};

/**
 * Sends at most one automatic reminder per store per month and phase:
 *  - day >= 25: "add this month's expenses" if the store has none for this month
 *  - day <= 5: "add last month's expenses" if the store has none for last month
 */
const runExpenseReminders = async (io) => {
  const now = new Date();
  const day = now.getDate();
  const jobs = [];
  if (day >= MONTH_END_FROM_DAY) jobs.push({ month: monthKey(now), phase: 'END' });
  if (day <= MONTH_START_UNTIL_DAY) jobs.push({ month: previousMonthKey(now), phase: 'START' });
  if (!jobs.length) return 0;

  const stores = await Store.find({ isActive: true }, 'storeCode storeName').lean();
  let sent = 0;
  for (const { month, phase } of jobs) {
    const code = `EXP-${month}-${phase}`;
    const [withExpenses, alreadyReminded] = await Promise.all([
      StoreExpense.distinct('storeId', { month }),
      Notification.distinct('recipientStoreId', { type: 'EXPENSE_REMINDER', requestCode: code })
    ]);
    const skip = new Set([...withExpenses, ...alreadyReminded].map(String));
    for (const store of stores) {
      if (skip.has(String(store._id))) continue;
      await notifyStore(io, store, {
        type: 'EXPENSE_REMINDER',
        title: phase === 'END' ? `Add ${monthLabel(month)} expenses` : `${monthLabel(month)} expenses are missing`,
        message: phase === 'END'
          ? `The month is ending. Please add this month's store expenses (rent, electricity, salaries...) so your executive officer can check them.`
          : `No expenses were added for ${monthLabel(month)}. Please add them now so your executive officer can check them.`,
        code
      });
      sent += 1;
    }
  }
  return sent;
};

const startExpenseReminders = (io) => {
  const run = () => runExpenseReminders(io)
    .then((n) => { if (n) console.log(`[expenses] sent ${n} expense reminder(s)`); })
    .catch((err) => console.error('[expenses] reminder job failed:', err.message));
  setTimeout(run, 15 * 1000);
  setInterval(run, 6 * 60 * 60 * 1000);
};

module.exports = { monthKey, previousMonthKey, monthLabel, notifyStore, notifyExecutive, runExpenseReminders, startExpenseReminders, MONTH_END_FROM_DAY, MONTH_START_UNTIL_DAY };
