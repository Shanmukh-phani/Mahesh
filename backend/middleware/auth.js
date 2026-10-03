const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader) {
      return res.status(401).send({ error: 'Please authenticate.' });
    }
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
    req.user = decoded;
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

module.exports = { auth, authorizeRoles };
