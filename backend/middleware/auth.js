const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Employee = require('../models/Employee');
const { resolveSession } = require('../utils/sessions');

// Verifies the JWT, then reloads the account so deactivation / role or store changes apply immediately.
const auth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader) {
      return res.status(401).send({ error: 'Please authenticate.' });
    }
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');

    const account = await User.findById(decoded._id)
      .select('username role adminLevel storeId employeeId name isActive')
      .lean();
    if (!account || account.isActive === false) {
      return res.status(401).send({ error: 'Account is inactive. Please contact your administrator.' });
    }

    let employee = null;
    if (account.role === 'MINI_STORE') {
      if (!account.employeeId) {
        return res.status(401).send({ error: 'Shared store logins are disabled. Ask your executive officer for your employee login.' });
      }
      employee = await Employee.findById(account.employeeId).select('employeeName designation isActive storeId').lean();
      if (!employee || employee.isActive === false || String(employee.storeId) !== String(account.storeId)) {
        return res.status(401).send({ error: 'Employee login is inactive. Please contact your executive officer.' });
      }
    }

    let sid;
    try {
      sid = await resolveSession({ decoded, token, account, employee, req });
    } catch (err) {
      console.error('[activity] session tracking failed:', err.message);
    }
    if (sid === false) {
      return res.status(401).send({ error: 'Your session has ended. Please sign in again.' });
    }

    req.user = {
      ...decoded,
      _id: String(account._id),
      username: account.username,
      role: account.role,
      adminLevel: account.role === 'ADMIN' ? (account.adminLevel || 'MAIN') : undefined,
      storeId: account.storeId ? String(account.storeId) : undefined,
      employeeId: employee ? String(employee._id) : undefined,
      employeeName: employee?.employeeName,
      designation: employee?.designation,
      name: employee?.employeeName || account.name || account.username,
      sid: sid || decoded.sid
    };
    next();
  } catch (error) {
    res.status(401).send({ error: 'Please authenticate.' });
  }
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).send({ error: 'Access denied.' });
    }
    next();
  };
};

const requireMainAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN' || req.user.adminLevel === 'SUB') {
    return res.status(403).send({ error: 'Only the main admin can do this.' });
  }
  next();
};

module.exports = { auth, authorizeRoles, requireMainAdmin };
