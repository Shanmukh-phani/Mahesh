const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Store = require('../models/Store');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).send({ error: 'Username/Store ID and password are required' });
    }

    const trimmedInput = username.trim();

    // 1. First search direct username
    let user = await User.findOne({ 
      username: new RegExp(`^${trimmedInput}$`, 'i'),
      isActive: true 
    }).populate('storeId');

    // 2. If not found by username, search by storeCode in Store model
    if (!user) {
      const store = await Store.findOne({ 
        storeCode: new RegExp(`^${trimmedInput}$`, 'i'),
        isActive: true 
      });
      if (store) {
        user = await User.findOne({ storeId: store._id, isActive: true }).populate('storeId');
      }
    }

    if (!user) {
      return res.status(400).send({ error: 'Invalid login credentials or account inactive' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).send({ error: 'Invalid login credentials' });
    }

    const token = jwt.sign(
      { 
        _id: user._id.toString(), 
        role: user.role, 
        storeId: user.storeId?._id?.toString(),
        storeCode: user.storeId?.storeCode
      },
      process.env.JWT_SECRET || 'secret123',
      { expiresIn: '7d' }
    );

    res.send({ 
      user: { 
        _id: user._id, 
        username: user.username, 
        role: user.role, 
        store: user.storeId, 
        name: user.name,
        email: user.email 
      }, 
      token 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).send({ error: 'Server error during authentication' });
  }
});

module.exports = router;
