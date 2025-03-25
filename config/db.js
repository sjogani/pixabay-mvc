const mysql = require('mysql2/promise');
require('dotenv').config();

// Create MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'music',
  waitForConnections: true,
  connectionLimit: 20, // Increased connection limit
  queueLimit: 0,
});

module.exports = pool;
