import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'artist_map',
  password: process.env.DB_PASSWORD || 'some_password',
  port: parseInt(process.env.DB_PORT || '5432'),
});

// Connection tests
pool.on('connect', () => {
  console.log('Yes, good. Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('No, not okay. Unexpected error on idle client', err);
  process.exit(-1);
});

export default pool;
