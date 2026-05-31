import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { generateVenueSearchAliases } from '../services/venueAliasService';

type PlaceLocationAliasRow = {
    id: string;
    name: string;
    formatted: string | null;
    address_line1: string | null;
    country: string | null;
    country_code: string | null;
};

const batchSize = 500;

function isApplyRun() {
    return process.argv.includes('--apply');
}

function allowLocalPostgres() {
    return process.argv.includes('--local');
}

async function backfillRows(rows: PlaceLocationAliasRow[], apply: boolean, update: (id: string, aliases: string[]) => Promise<void>) {
    let updated = 0;
    for (const row of rows) {
        const searchAliases = await generateVenueSearchAliases(
            [row.name, row.formatted, row.address_line1],
            { country: row.country, countryCode: row.country_code }
        );
        if (searchAliases.length === 0) continue;

        if (apply) {
            await update(row.id, searchAliases);
        }
        updated += 1;
    }

    return updated;
}

async function runSupabaseBackfill(apply: boolean) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase backfill.');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    let total = 0;
    for (let from = 0; ; from += batchSize) {
        const to = from + batchSize - 1;
        const { data, error } = await supabase
            .from('place_locations')
            .select('id,name,formatted,address_line1,country,country_code')
            .eq('is_venue', true)
            .order('updated_at', { ascending: false })
            .range(from, to);

        if (error) throw error;
        const rows = (data ?? []) as PlaceLocationAliasRow[];
        if (rows.length === 0) break;

        total += await backfillRows(rows, apply, async (id, searchAliases) => {
            const { error: updateError } = await supabase
                .from('place_locations')
                .update({ search_aliases: searchAliases })
                .eq('id', id);
            if (updateError) throw updateError;
        });

        if (rows.length < batchSize) break;
    }

    console.log(`${apply ? 'updated' : 'would update'} ${total} venue aliases via Supabase`);
}

async function runPostgresBackfill(apply: boolean) {
    const { default: pool } = await import('../config/database');
    const result = await pool.query<PlaceLocationAliasRow>(`
        SELECT id, name, formatted, address_line1, country, country_code
        FROM place_locations
        WHERE is_venue = TRUE
        ORDER BY updated_at DESC
    `);

    const updated = await backfillRows(result.rows, apply, async (id, searchAliases) => {
        await pool.query(`
                UPDATE place_locations
                SET search_aliases = $2, updated_at = NOW()
                WHERE id = $1
            `, [id, searchAliases]);
    });

    await pool.end();
    console.log(`${apply ? 'updated' : 'would update'} ${updated} venue aliases via Postgres`);
}

async function main() {
    const apply = isApplyRun();
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.DATABASE_URL) {
        await runSupabaseBackfill(apply);
        return;
    }

    if (!process.env.DATABASE_URL && !allowLocalPostgres()) {
        throw new Error('No Supabase service credentials or DATABASE_URL found. Pass --local only when you intentionally want local Postgres.');
    }

    await runPostgresBackfill(apply);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
