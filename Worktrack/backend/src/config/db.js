const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:             process.env.DB_HOST     || 'localhost',
  port:             parseInt(process.env.DB_PORT) || 3306,
  user:             process.env.DB_USER     || 'root',
  password:         process.env.DB_PASSWORD || '',
  database:         process.env.DB_NAME     || 'worktrack',
  waitForConnections: true,
  connectionLimit:  20,
  queueLimit:       0,
  timezone:         '+07:00',
  charset:          'utf8mb4',
  // Tối ưu performance
  enableKeepAlive:  true,
  keepAliveInitialDelay: 0,
  // Cache prepared statements
  namedPlaceholders: false,
});

pool.getConnection()
  .then(c => { console.log('✅ MySQL connected'); c.release(); })
  .catch(e => console.error('❌ MySQL:', e.message));

module.exports = pool;