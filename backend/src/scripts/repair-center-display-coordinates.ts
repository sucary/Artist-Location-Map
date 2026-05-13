import 'dotenv/config';
import pool from '../config/database';
import { CityService } from '../services/cityService';

// Repair artist display coordinates that fell back to city centers

async function repairCenterDisplayCoordinates() {
    const result = await pool.query<{
        id: string;
        user_id: string;
        original_city_id: string | null;
        active_city_id: string | null;
        original_matches_center: boolean;
        active_matches_center: boolean;
    }>(`
        SELECT
            a.id,
            a.user_id,
            a.original_city_id,
            a.active_city_id,
            ST_DWithin(a.original_display_coordinates, l_original.center::geography, 0.1) as original_matches_center,
            ST_DWithin(a.active_display_coordinates, l_active.center::geography, 0.1) as active_matches_center
        FROM artists a
        LEFT JOIN locations l_original ON a.original_city_id = l_original.id
        LEFT JOIN locations l_active ON a.active_city_id = l_active.id
        WHERE (
            a.original_city_id IS NOT NULL
            AND a.original_display_coordinates IS NOT NULL
            AND l_original.center IS NOT NULL
            AND ST_DWithin(a.original_display_coordinates, l_original.center::geography, 0.1)
        ) OR (
            a.active_city_id IS NOT NULL
            AND a.active_display_coordinates IS NOT NULL
            AND l_active.center IS NOT NULL
            AND ST_DWithin(a.active_display_coordinates, l_active.center::geography, 0.1)
        )
        ORDER BY a.created_at ASC
    `);

    console.log(`Found ${result.rows.length} artist(s) with center display coordinates.`);

    for (const row of result.rows) {
        if (row.original_matches_center && row.original_city_id) {
            const point = await CityService.generateRandomPoint(row.original_city_id, undefined, row.user_id);
            if (point) {
                await pool.query(`
                    UPDATE artists
                    SET original_display_coordinates = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
                    WHERE id = $3
                `, [point.lng, point.lat, row.id]);
            }
        }

        if (row.active_matches_center && row.active_city_id) {
            const point = await CityService.generateRandomPoint(row.active_city_id, undefined, row.user_id);
            if (point) {
                await pool.query(`
                    UPDATE artists
                    SET active_display_coordinates = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
                    WHERE id = $3
                `, [point.lng, point.lat, row.id]);
            }
        }
    }

    console.log('Repair complete.');
    await pool.end();
}

repairCenterDisplayCoordinates().catch((error) => {
    console.error('Repair failed:', error);
    pool.end();
    process.exit(1);
});
