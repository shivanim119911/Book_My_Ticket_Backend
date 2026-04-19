const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { run, get, all } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'bookmyticket_secret_key_2024';

// Middleware: verify JWT token
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Login required to book tickets' });
  }
  try {
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Session expired, please login again' });
  }
}

// POST /api/bookings — create a new booking
router.post('/', authenticate, (req, res) => {
  try {
    const { fromStation, toStation, trainName, travelDate, seats } = req.body;

    if (!fromStation || !toStation || !trainName || !travelDate || !seats?.length) {
      return res.status(400).json({ success: false, message: 'All booking details are required' });
    }

    if (fromStation === toStation) {
      return res.status(400).json({ success: false, message: 'Source and destination cannot be the same' });
    }

    // Generate PNR
    const countRow = get('SELECT COUNT(*) as count FROM bookings');
    const count = (countRow ? countRow.count : 0) + 1;
    const pnr = 'TT' + String(count).padStart(6, '0');

    const fare = Math.floor((Math.random() * 500 + 200) * seats.length);
    const seatsStr = seats.sort((a, b) => a - b).join(',');

    run(
      `INSERT INTO bookings (pnr, user_id, from_station, to_station, train_name, travel_date, seats, fare)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [pnr, req.user.id, fromStation, toStation, trainName, travelDate, seatsStr, fare]
    );

    res.status(201).json({
      success: true,
      booking: { pnr, fromStation, toStation, trainName, travelDate, seats, fare, status: 'Confirmed' }
    });

  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ success: false, message: 'Server error during booking' });
  }
});

// GET /api/bookings — get all bookings for logged-in user
router.get('/', authenticate, (req, res) => {
  try {
    const bookings = all(
      'SELECT * FROM bookings WHERE user_id = ? ORDER BY booked_at DESC',
      [req.user.id]
    );
    const formatted = bookings.map(b => ({ ...b, seats: b.seats.split(',').map(Number) }));
    res.json({ success: true, bookings: formatted });
  } catch (err) {
    console.error('Fetch bookings error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch bookings' });
  }
});

// PATCH /api/bookings/:pnr/cancel — cancel a booking
router.patch('/:pnr/cancel', authenticate, (req, res) => {
  try {
    const booking = get('SELECT * FROM bookings WHERE pnr = ? AND user_id = ?', [req.params.pnr, req.user.id]);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status === 'Cancelled') return res.status(400).json({ success: false, message: 'Booking already cancelled' });

    run('UPDATE bookings SET status = ? WHERE pnr = ?', ['Cancelled', req.params.pnr]);
    res.json({ success: true, message: 'Booking cancelled successfully' });
  } catch (err) {
    console.error('Cancel error:', err);
    res.status(500).json({ success: false, message: 'Could not cancel booking' });
  }
});

// ── Admin middleware ──────────────────────────────────────────────────────────
function adminOnly(req, res, next) {
  if (!req.user.isAdmin) return res.status(403).json({ success: false, message: 'Admin access required' });
  next();
}

// GET /api/bookings/admin/all — admin: all bookings with passenger info
router.get('/admin/all', authenticate, adminOnly, (req, res) => {
  try {
    const bookings = all(`
      SELECT b.*, u.name as passenger_name, u.email, u.mobile, u.acc_id
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      ORDER BY b.booked_at DESC
    `);
    const formatted = bookings.map(b => ({ ...b, seats: b.seats.split(',').map(Number) }));
    res.json({ success: true, bookings: formatted });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not fetch all bookings' });
  }
});

// GET /api/bookings/admin/stats — admin: summary stats
router.get('/admin/stats', authenticate, adminOnly, (req, res) => {
  try {
    const totalUsers    = get('SELECT COUNT(*) as c FROM users WHERE is_admin = 0').c;
    const totalBookings = get('SELECT COUNT(*) as c FROM bookings').c;
    const confirmed     = get("SELECT COUNT(*) as c FROM bookings WHERE status = 'Confirmed'").c;
    const cancelled     = get("SELECT COUNT(*) as c FROM bookings WHERE status = 'Cancelled'").c;
    const revenue       = get("SELECT SUM(fare) as s FROM bookings WHERE status = 'Confirmed'").s || 0;
    res.json({ success: true, stats: { totalUsers, totalBookings, confirmed, cancelled, revenue } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not fetch stats' });
  }
});

module.exports = router;
