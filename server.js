const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const databasePath = process.env.DATABASE_PATH || './data/artashop.sqlite';
fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });

if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('Set SESSION_SECRET to a random string of at least 32 characters in production.');
}
const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 item_name TEXT NOT NULL,
 amount INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || '';
if (adminEmail && adminPassword) {
  const found = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!found) {
    const hash = bcrypt.hashSync(adminPassword, 12);
    db.prepare('INSERT INTO users (username,email,password_hash,role) VALUES (?,?,?,?)')
      .run('Administrator', adminEmail, hash, 'admin');
    console.log('Admin account created from environment configuration.');
  } else {
    db.prepare("UPDATE users SET role='admin' WHERE email=?").run(adminEmail);
  }
}

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(session({
  name: 'artashop.sid',
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.dirname(path.resolve(databasePath)) }),
  secret: process.env.SESSION_SECRET || 'local-development-only-secret-change-before-deploy-123456',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: 1000 * 60 * 60 * 8 }
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'ลองใหม่อีกครั้งในภายหลังนะ' } });
const clean = v => String(v || '').trim();
const emailValid = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
function currentUser(req) {
  if (!req.session.userId) return null;
  return db.prepare('SELECT id, username, email, role, created_at FROM users WHERE id=?').get(req.session.userId) || null;
}
function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
  req.user = user; next();
}
function requireAdmin(req, res, next) {
  const user = currentUser(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'สำหรับผู้ดูแลระบบเท่านั้น' });
  req.user = user; next();
}
app.get('/api/health', (req,res) => res.json({ ok: true, app: 'Artashop Ez' }));
app.get('/api/me', (req,res) => res.json({ user: currentUser(req) }));

app.post('/api/register', authLimiter, (req,res) => {
  const username = clean(req.body.username);
  const email = clean(req.body.email).toLowerCase();
  const password = String(req.body.password || '');
  if (username.length < 2 || username.length > 32) return res.status(400).json({ error: 'ชื่อผู้ใช้ต้องมี 2–32 ตัวอักษร' });
  if (!emailValid(email) || email.length > 160) return res.status(400).json({ error: 'กรุณากรอกอีเมลให้ถูกต้อง' });
  if (password.length < 10 || password.length > 72) return res.status(400).json({ error: 'รหัสผ่านต้องมี 10–72 ตัวอักษร' });
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return res.status(400).json({ error: 'รหัสผ่านควรมีทั้งตัวอักษรและตัวเลข' });
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'อีเมลนี้มีบัญชีแล้ว ลองเข้าสู่ระบบนะ' });
  const hash = bcrypt.hashSync(password, 12);
  const result = db.prepare('INSERT INTO users (username,email,password_hash) VALUES (?,?,?)').run(username,email,hash);
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'สร้างเซสชันไม่สำเร็จ กรุณาลองใหม่' });
    req.session.userId = Number(result.lastInsertRowid);
    req.session.save(err2 => {
      if (err2) return res.status(500).json({ error: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่' });
      res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ 💙', user: currentUser(req) });
    });
  });
});

app.post('/api/login', authLimiter, (req,res) => {
  const email = clean(req.body.email).toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่' });
    req.session.userId = user.id;
    req.session.save(err2 => {
      if (err2) return res.status(500).json({ error: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่' });
      res.json({ message: 'เข้าสู่ระบบสำเร็จ ยินดีต้อนรับกลับนะ 💙', user: currentUser(req) });
    });
  });
});

app.post('/api/logout', (req,res) => req.session.destroy(() => {
  res.clearCookie('artashop.sid'); res.json({ message: 'ออกจากระบบแล้ว' });
}));

app.get('/api/admin/summary', requireAdmin, (req,res) => {
  const users = db.prepare('SELECT id,username,email,role,created_at FROM users ORDER BY id DESC LIMIT 200').all();
  const orders = db.prepare('SELECT o.id,o.item_name,o.amount,o.status,o.created_at,u.username,u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 200').all();
  res.json({ users, orders, stats: { users: db.prepare('SELECT count(*) c FROM users').get().c, orders: db.prepare('SELECT count(*) c FROM orders').get().c } });
});
app.post('/api/admin/orders', requireAdmin, (req,res) => {
  const id = Number(req.body.id);
  const status = clean(req.body.status);
  if (!Number.isInteger(id) || !['pending','confirmed','completed','cancelled'].includes(status)) return res.status(400).json({ error: 'ข้อมูลสถานะไม่ถูกต้อง' });
  const result = db.prepare('UPDATE orders SET status=? WHERE id=?').run(status,id);
  if (!result.changes) return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });
  res.json({ message: 'อัปเดตสถานะแล้ว' });
});
// Example authenticated order endpoint; connect it to the real product catalogue before taking payments.
app.post('/api/orders', requireAuth, (req,res) => {
  const itemName = clean(req.body.itemName);
  const amount = Number(req.body.amount);
  if (itemName.length < 2 || itemName.length > 120 || !Number.isInteger(amount) || amount < 0 || amount > 10000000)
    return res.status(400).json({ error: 'รายละเอียดคำสั่งซื้อไม่ถูกต้อง' });
  const result = db.prepare('INSERT INTO orders (user_id,item_name,amount) VALUES (?,?,?)').run(req.user.id,itemName,amount);
  res.status(201).json({ message: 'บันทึกคำขอสั่งซื้อแล้ว', orderId: Number(result.lastInsertRowid) });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req,res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(port, () => console.log(`Artashop Ez running on port ${port}`));
