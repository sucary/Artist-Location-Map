import { Pool } from 'pg';

const poolConfig = {
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
};

const pool = process.env.DATABASE_URL
    ? new Pool({
        ...poolConfig,
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    })
    : new Pool({
        ...poolConfig,
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'artist_map',
        password: process.env.DB_PASSWORD || 'testpassword',
        port: parseInt(process.env.DB_PORT || '5432'),
    });

// Connection tests
pool.on('connect', () => {
    console.log('Yes, good. Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('pg pool idle client error:', err);
});


export async function verifyDatabaseConnection() {
    try {
        const result = await pool.query('SELECT version() as version');
        const version = result.rows[0].version;
        const dbType = process.env.DATABASE_URL ? '☁️ SUPABASE' : '💻 LOCAL';
        console.log(`Database: ${dbType} - ${version.split(',')[0]}`);
        return { success: true };
    } catch (error) {
        console.error('Database connection failed:', error);
        return { success: false };
    }
}

export default pool;
