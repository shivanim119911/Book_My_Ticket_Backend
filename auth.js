const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { run, get } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'bookmyticket_secret_key_2024';

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, mobile, address, age, gender, password } = req.body;

    // Validation
    if (!name || !email || !mobile || !address || !age || !gender || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    if (String(mobile).length !== 10) {
      return res.status(400).json({ success: false, message: 'Mobile must be 10 digits' });
    }

    // Check if email already exists
    const existing = get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate Account ID
    const countRow = get('SELECT COUNT(*) as count FROM users');
    const count = (countRow ? countRow.count : 0) + 1;
    const accId = 'BMT' + String(count).padStart(4, '0');

    // Insert user
    run(
      `INSERT INTO users (acc_id, name, email, mobile, address, age, gender, password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [accId, name, email, mobile, address, parseInt(age), gender, hashedPassword]
    );

    res.status(201).json({
      success: true,
      message: 'Registered successfully!',
      accId
    });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, accId: user.acc_id, isAdmin: !!user.is_admin },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: `Welcome back, ${user.name}!`,
      token,
      user: {
        id: user.id,
        accId: user.acc_id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        gender: user.gender,
        isAdmin: !!user.is_admin
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// GET /api/auth/me  — verify token and return user info
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = get('SELECT id, acc_id, name, email, mobile, address, age, gender, is_admin FROM users WHERE id = ?', [decoded.id]);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: { ...user, accId: user.acc_id, isAdmin: !!user.is_admin } });
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
});

// PUT /api/auth/profile — update profile
router.put('/profile', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);

  const { name, mobile, address, age, gender, currentPassword, newPassword } = req.body;
  if (!name || !mobile || !address || !age || !gender) {
    return res.status(400).json({ success: false, message: 'All profile fields are required' });
  }

  const user = get('SELECT * FROM users WHERE id = ?', [decoded.id]);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  let passwordToSave = user.password;
  if (newPassword) {
    if (!currentPassword) return res.status(400).json({ success: false, message: 'Current password required to set a new one' });
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    passwordToSave = await bcrypt.hash(newPassword, 10);
  }

  run('UPDATE users SET name=?, mobile=?, address=?, age=?, gender=?, password=? WHERE id=?',
    [name, mobile, address, parseInt(age), gender, passwordToSave, decoded.id]);

  res.json({ success: true, message: 'Profile updated successfully' });
});

// GET /api/auth/admin/users — admin: list all users
router.get('/admin/users', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Unauthorized' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ success: false, message: 'Admin only' });
    const users = require('../db').all(
      'SELECT id, acc_id, name, email, mobile, gender, age, created_at FROM users WHERE is_admin = 0 ORDER BY created_at DESC'
    );
    res.json({ success: true, users });
  } catch {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

module.exports = router;
