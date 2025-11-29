import pool from '../config/database';

async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('Database connected successfully!');
    console.log('Current time from DB:', result.rows[0].now);

    // Test PostGIS
    const postgisVersion = await pool.query('SELECT PostGIS_version()');
    console.log('✅ PostGIS version:', postgisVersion.rows[0].postgis_version);

    process.exit(0);
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

testConnection();
