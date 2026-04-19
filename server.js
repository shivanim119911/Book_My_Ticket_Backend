const express = require('express');
const cors    = require('cors');
const { getDb } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// Allow requests from any Netlify/browser origin
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json());

// Health check (Render pings this)
app.get('/', (req, res) => res.json({ status: 'Book My Ticket API is running 🚆' }));

// Routes
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/bookings', require('./routes/bookings'));

// 404
app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

getDb().then(() => {
  app.listen(PORT, () => {
    console.log(`🚆 Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});
