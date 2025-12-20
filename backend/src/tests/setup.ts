import dotenv from 'dotenv';
import path from 'path';

// Load test env with override BEFORE importing pool
dotenv.config({ 
    path: path.resolve(__dirname, '../../.env.test'),
    override: true
});

import pool from '../config/database';
import fs from 'fs';

export async function initTestDb() {
    
    await pool.query('DROP TABLE IF EXISTS artists CASCADE');

    const schema = fs.readFileSync(
        path.resolve(__dirname, '../db/schema.sql'),
        'utf-8'
    );
    await pool.query(schema);
}

export async function cleanupTestDb() {
    await pool.query('TRUNCATE artists RESTART IDENTITY CASCADE');
}

export async function closeTestDb() {
    await pool.end();
}