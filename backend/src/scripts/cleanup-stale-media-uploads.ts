import 'dotenv/config';
import pool from '../config/database';
import { MediaCleanupService } from '../services/mediaCleanupService';

type StaleUploadRow = {
    public_id: string;
    secure_url: string;
    user_id: string;
    created_at: Date;
};

function getArgValue(name: string, fallback: string) {
    const arg = process.argv.find((item) => item.startsWith(`${name}=`));
    return arg ? arg.slice(name.length + 1) : fallback;
}

async function main() {
    const olderThanHours = Number(getArgValue('--older-than-hours', '24'));
    const limit = Number(getArgValue('--limit', '100'));
    const dryRun = !process.argv.includes('--delete');

    if (!Number.isFinite(olderThanHours) || olderThanHours <= 0) {
        throw new Error('--older-than-hours must be a positive number');
    }
    if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error('--limit must be a positive number');
    }

    const result = await pool.query<StaleUploadRow>(`
        SELECT e.public_id, e.secure_url, e.user_id, e.created_at
        FROM media_upload_events e
        WHERE e.status = 'uploaded'
          AND e.secure_url IS NOT NULL
          AND e.created_at < NOW() - ($1::int * INTERVAL '1 hour')
          AND NOT EXISTS (
              SELECT 1 FROM artist_media_assets a
              WHERE a.public_id = e.public_id OR a.source_image = e.secure_url
          )
          AND NOT EXISTS (
              SELECT 1 FROM artist_media_asset_reviews r
              WHERE (r.public_id = e.public_id OR r.source_image = e.secure_url)
                AND r.status <> 'rejected'
          )
          AND NOT EXISTS (
              SELECT 1 FROM artists a
              WHERE a.source_image = e.secure_url
          )
        ORDER BY e.created_at ASC
        LIMIT $2
    `, [olderThanHours, limit]);

    console.log(`Found ${result.rows.length} stale uploaded media file(s).`);

    if (dryRun) {
        for (const row of result.rows) {
            console.log(`[dry-run] ${row.public_id} uploaded by ${row.user_id} at ${row.created_at.toISOString()}`);
        }
        console.log('Dry run only. Re-run with --delete to remove these Cloudinary files.');
        return;
    }

    let deleted = 0;
    let kept = 0;
    for (const row of result.rows) {
        const cleanup = await MediaCleanupService.deleteOwnedUploadByUrlIfUnused(
            row.user_id,
            row.secure_url
        );
        if (cleanup.deleted) {
            deleted += 1;
            console.log(`[deleted] ${row.public_id}`);
        } else {
            kept += 1;
            console.log(`[kept] ${row.public_id}${cleanup.inUse ? ' still referenced' : ''}`);
        }
    }

    console.log(`Done. Deleted: ${deleted}. Kept: ${kept}.`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
