const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// On Render, use /tmp for writable storage (ephemeral but works for free tier)
const DB_PATH = process.env.DB_PATH || path.join('/tmp', 'bookmyticket.sqlite');

let db;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acc_id TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL, mobile TEXT NOT NULL,
    address TEXT NOT NULL, age INTEGER NOT NULL,
    gender TEXT NOT NULL, password TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.run('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0'); } catch {}

  db.run(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pnr TEXT UNIQUE NOT NULL, user_id INTEGER NOT NULL,
    from_station TEXT NOT NULL, to_station TEXT NOT NULL,
    train_name TEXT NOT NULL, travel_date TEXT NOT NULL,
    seats TEXT NOT NULL, fare INTEGER NOT NULL,
    status TEXT DEFAULT 'Confirmed',
    booked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Seed default admin
  const bcrypt = require('bcryptjs');
  const adminRow = get('SELECT id FROM users WHERE is_admin = 1');
  if (!adminRow) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.run(
      `INSERT INTO users (acc_id,name,email,mobile,address,age,gender,password,is_admin)
       VALUES ('ADMIN001','Administrator','admin@bmt.com','0000000000','Admin HQ',30,'Other',?,1)`,
      [hash]
    );
    console.log('✅ Admin seeded → admin@bmt.com / admin123');
  }

  saveDb();
  return db;
}

function saveDb() {
  if (!db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function run(sql, params = []) { db.run(sql, params); saveDb(); }

function get(sql, params = []) {
  const s = db.prepare(sql); s.bind(params);
  if (s.step()) { const r = s.getAsObject(); s.free(); return r; }
  s.free(); return null;
}

function all(sql, params = []) {
  const s = db.prepare(sql); s.bind(params);
  const rows = [];
  while (s.step()) rows.push(s.getAsObject());
  s.free(); return rows;
}

module.exports = { getDb, run, get, all, saveDb };
