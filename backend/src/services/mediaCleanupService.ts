import cloudinary from '../config/cloudinary';
import pool from '../config/database';

type CleanupResult = {
    deleted: boolean;
    inUse: boolean;
};

async function isPublicIdReferenced(publicId: string, secureUrl?: string | null): Promise<boolean> {
    const result = await pool.query<{ referenced: boolean }>(`
        SELECT EXISTS (
            SELECT 1 FROM artist_media_assets
            WHERE public_id = $1 OR ($2::text IS NOT NULL AND source_image = $2)
            UNION ALL
            SELECT 1 FROM artist_media_asset_reviews
            WHERE (public_id = $1 OR ($2::text IS NOT NULL AND source_image = $2))
              AND status <> 'rejected'
            UNION ALL
            SELECT 1 FROM artists
            WHERE $2::text IS NOT NULL AND source_image = $2
        ) as referenced
    `, [publicId, secureUrl]);

    return result.rows[0]?.referenced ?? true;
}

async function destroyCloudinaryImage(publicId: string) {
    const destroyResult = await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image'
    });

    if (destroyResult.result !== 'ok' && destroyResult.result !== 'not found') {
        throw new Error(`Cloudinary deletion failed: ${destroyResult.result}`);
    }

    await pool.query(`
        UPDATE media_upload_events
        SET status = 'deleted'
        WHERE public_id = $1
    `, [publicId]);
}

export const MediaCleanupService = {
    deleteOwnedUploadByUrlIfUnused: async (
        userId: string,
        secureUrl?: string | null
    ): Promise<CleanupResult> => {
        if (!secureUrl) return { deleted: false, inUse: false };

        const uploadResult = await pool.query<{ public_id: string }>(`
            SELECT public_id
            FROM media_upload_events
            WHERE user_id = $1
              AND secure_url = $2
              AND status = 'uploaded'
            ORDER BY completed_at DESC NULLS LAST, created_at DESC
            LIMIT 1
        `, [userId, secureUrl]);

        const publicId = uploadResult.rows[0]?.public_id;
        if (!publicId) return { deleted: false, inUse: false };

        const inUse = await isPublicIdReferenced(publicId, secureUrl);
        if (inUse) return { deleted: false, inUse: true };

        await destroyCloudinaryImage(publicId);

        return { deleted: true, inUse: false };
    },

    deletePublicIdIfUnused: async (publicId?: string | null): Promise<CleanupResult> => {
        if (!publicId) return { deleted: false, inUse: false };

        const inUse = await isPublicIdReferenced(publicId);
        if (inUse) return { deleted: false, inUse: true };

        await destroyCloudinaryImage(publicId);
        return { deleted: true, inUse: false };
    }
};
