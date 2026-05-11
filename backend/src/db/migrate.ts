import 'dotenv/config';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import pool from '../config/database';

// SQL migration runner with applied filename records

const MIGRATIONS_LOCK_ID = 42024011; // Shared lock key for migration runs

async function getMigrationFiles(): Promise<string[]> {
    const migrationsDir = path.resolve(process.cwd(), 'src/db/migrations');
    const entries = await readdir(migrationsDir);
    return entries
        .filter((entry) => entry.endsWith('.sql'))
        .sort()
        .map((entry) => path.join(migrationsDir, entry));
}

async function runMigrations() {
    const client = await pool.connect();

    try {
        // Allow one migration run at a time across deploys
        await client.query('SELECT pg_advisory_lock($1)', [MIGRATIONS_LOCK_ID]);
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.schema_migrations (
                filename TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        const migrationFiles = await getMigrationFiles();

        for (const migrationPath of migrationFiles) {
            const filename = path.basename(migrationPath);
            const applied = await client.query(
                'SELECT 1 FROM public.schema_migrations WHERE filename = $1',
                [filename]
            );
            if (applied.rows.length > 0) continue;

            const sql = await readFile(migrationPath, 'utf8');
            console.log(`[migrate] applying ${filename}`);

            try {
                // Keep the migration and filename record in one transaction
                await client.query('BEGIN');
                await client.query(sql);
                await client.query(
                    'INSERT INTO public.schema_migrations (filename) VALUES ($1)',
                    [filename]
                );
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            }
        }

        console.log('[migrate] database is up to date');
    } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATIONS_LOCK_ID]).catch(() => {});
        client.release();
    }
}

runMigrations()
    .catch((error) => {
        console.error('[migrate] failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
