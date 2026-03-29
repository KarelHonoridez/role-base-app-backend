// server.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'your-very-secure-secret'; // In production, use environment variables!

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'role_based_app'
};

let pool;


async function initDb() {
  pool = await mysql.createPool({
    ...DB_CONFIG,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  await pool.query(`
    CREATE DATABASE IF NOT EXISTS ${DB_CONFIG.database};
  `);

  await pool.query(`USE ${DB_CONFIG.database}`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role ENUM('admin','user') NOT NULL DEFAULT 'user',
      verified TINYINT(1) NOT NULL DEFAULT 1,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default accounts if not present
  const [rows] = await pool.query('SELECT COUNT(*) AS count FROM users');
  if (rows[0].count === 0) {
    const adminHash = await bcrypt.hash('admin123', 10);
    const userHash = await bcrypt.hash('user123', 10);
    await pool.query(
      'INSERT INTO users (username, email, password, role, verified) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)',
      ['admin', 'admin@example.com', adminHash, 'admin', 1, 'alice', 'alice@example.com', userHash, 'user', 1]
    );
  }
}

function rowToUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    verified: !!user.verified
  };
}

// Enable CORS for frontend (e.g., Live Server on port 5500)
app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500'] // Adjust based on your frontend URL
}));

// Middleware to parse JSON
app.use(express.json());

// Helper: Hash password (run once to generate hashes)
// console.log(bcrypt.hashSync('admin123', 10)); // Use this to generate real hashes

// AUTH ROUTES

// POST /api/register
app.post('/api/register', async (req, res) => {
  const { email, password, role = 'user' } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const username = email.split('@')[0];

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
  if (existing.length > 0) {
    return res.status(409).json({ error: 'User already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO users (username, email, password, role, verified) VALUES (?, ?, ?, ?, ?)',
    [username, email, hashedPassword, role === 'admin' ? 'admin' : 'user', 1]
  );

  res.status(201).json({ message: 'User registered', email, role: role === 'admin' ? 'admin' : 'user' });
});

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { email, username, password } = req.body;
  const identity = email || username;

  const [rows] = await pool.query('SELECT * FROM users WHERE email = ? OR username = ?', [identity, identity]);
  const user = rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const payload = { id: user.id, username: user.username, email: user.email, role: user.role };
  const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '1h' });

  res.json({ token, user: { username: user.username, email: user.email, role: user.role } });
});

// PROTECTED ROUTE: Get user profile
app.get('/api/profile', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// ROLE-BASED PROTECTED ROUTE: Admin-only
app.get('/api/admin/dashboard', authenticateToken, authorizeRole('admin'), (req, res) => {
  res.json({ message: 'Welcome to admin dashboard!', data: 'Secret admin info' });
});

// LOGOUT (optional token blacklist later)
app.post('/api/logout', authenticateToken, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// PUBLIC ROUTE: Guest content
app.get('/api/content/guest', (req, res) => {
  res.json({ message: 'Public content for all visitors' });
});


// MIDDLEWARE

// Token authentication
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// Role authorization
function authorizeRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }
    next();
  };
}

// Start server with DB initialization
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
    console.log('Try logging in with:');
    console.log(' - Admin: email=admin@example.com, password=admin123');
    console.log(' - User:  email=alice@example.com, password=user123');
  });
}).catch(err => {
  console.error('Failed to start DB:', err);
  process.exit(1);
});