import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { requireAuth, requireApproval, requireAdmin, AuthenticatedRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../middleware/errorHandler';
import cloudinary from '../config/cloudinary';
import pool from '../config/database';
import { MediaCleanupService } from '../services/mediaCleanupService';

const router = Router();
const NORMAL_USER_DAILY_UPLOAD_LIMIT = 50;

router.get(
    '/artist-media/:mbid',
    requireAuth,
    requireApproval,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const userId = req.user!.id;
        const isAdmin = req.profile?.isAdmin ?? false;
        const result = await pool.query<{
            source_image: string;
            avatar_crop: unknown;
            profile_crop: unknown;
            uploaded_by: string | null;
            original_uploaded_by: string | null;
        }>(`
            SELECT source_image, avatar_crop, profile_crop, uploaded_by, original_uploaded_by
            FROM artist_media_assets
            WHERE musicbrainz_mbid = $1
        `, [req.params.mbid]);

        const asset = result.rows[0];
        const isOriginalUploader = (asset?.original_uploaded_by || asset?.uploaded_by) === userId;
        const hasAsset = Boolean(asset);

        res.json({
            hasAsset,
            sourceImage: asset?.source_image || null,
            avatarCrop: asset?.avatar_crop || null,
            profileCrop: asset?.profile_crop || null,
            canReplaceDirectly: !hasAsset || isAdmin || isOriginalUploader,
            requiresReview: hasAsset && !isAdmin && !isOriginalUploader
        });
    })
);

/**
 * POST /api/upload/signature
 * Generates a signed set of Cloudinary upload parameters.
 * Requires authenticated + approved user.
 */
router.post(
    '/signature',
    requireAuth,
    requireApproval,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const userId = req.user!.id;
        const isAdmin = req.profile?.isAdmin ?? false;

        if (!isAdmin) {
            const quotaResult = await pool.query<{ count: string }>(`
                SELECT COUNT(*)::text as count
                FROM media_upload_events
                WHERE user_id = $1
                  AND created_at > NOW() - INTERVAL '24 hours'
                  AND status = 'uploaded'
            `, [userId]);

            const uploadCount = Number(quotaResult.rows[0]?.count || 0);
            if (uploadCount >= NORMAL_USER_DAILY_UPLOAD_LIMIT) {
                res.status(429).json({
                    error: 'Daily upload limit reached',
                    message: `You can upload up to ${NORMAL_USER_DAILY_UPLOAD_LIMIT} images per 24 hours.`
                });
                return;
            }
        }

        const timestamp = Math.round(Date.now() / 1000);
        const publicId = `artist_uploads/${userId}/${randomUUID()}`;

        const paramsToSign = {
            timestamp,
            public_id: publicId,
        };

        const signature = cloudinary.utils.api_sign_request(
            paramsToSign,
            process.env.CLOUDINARY_API_SECRET!
        );

        await pool.query(`
            INSERT INTO media_upload_events (user_id, public_id, status)
            VALUES ($1, $2, 'signed')
        `, [userId, publicId]);

        res.json({
            signature,
            timestamp,
            publicId,
            apiKey: process.env.CLOUDINARY_API_KEY,
            cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        });
    })
);

/**
 * POST /api/upload/complete
 * Records successful Cloudinary upload metadata for quota/audit tracking.
 */
router.post(
    '/complete',
    requireAuth,
    requireApproval,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const userId = req.user!.id;
        const {
            publicId,
            secureUrl,
            bytes,
            width,
            height,
            format
        } = req.body as {
            publicId?: string;
            secureUrl?: string;
            bytes?: number;
            width?: number;
            height?: number;
            format?: string;
        };

        if (!publicId || !secureUrl) {
            res.status(400).json({ error: 'publicId and secureUrl are required' });
            return;
        }

        const result = await pool.query(`
            UPDATE media_upload_events
            SET
                secure_url = $1,
                bytes = $2,
                width = $3,
                height = $4,
                format = $5,
                status = 'uploaded',
                completed_at = NOW()
            WHERE public_id = $6
              AND user_id = $7
            RETURNING id
        `, [
            secureUrl,
            Number.isFinite(bytes) ? bytes : null,
            Number.isFinite(width) ? width : null,
            Number.isFinite(height) ? height : null,
            format || null,
            publicId,
            userId
        ]);

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Upload reservation not found' });
            return;
        }

        res.json({ ok: true });
    })
);

router.delete(
    '/uploaded-image',
    requireAuth,
    requireApproval,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { secureUrl } = req.body as { secureUrl?: string };
        if (!secureUrl) {
            res.status(400).json({ error: 'secureUrl is required' });
            return;
        }

        const result = await MediaCleanupService.deleteOwnedUploadByUrlIfUnused(
            req.user!.id,
            secureUrl
        );

        res.json(result);
    })
);

router.get(
    '/admin/media-reviews',
    requireAuth,
    requireAdmin,
    asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
        const result = await pool.query(`
            SELECT
                r.id,
                r.musicbrainz_mbid as "musicbrainzMbid",
                mba.name as "artistName",
                r.source_image as "sourceImage",
                r.avatar_crop as "avatarCrop",
                r.profile_crop as "profileCrop",
                current_asset.source_image as "currentSourceImage",
                r.submitted_by as "submittedBy",
                p.username as "submittedByUsername",
                p.email as "submittedByEmail",
                r.created_at as "createdAt"
            FROM artist_media_asset_reviews r
            JOIN musicbrainz_artists mba ON r.musicbrainz_mbid = mba.mbid
            LEFT JOIN artist_media_assets current_asset ON r.musicbrainz_mbid = current_asset.musicbrainz_mbid
            LEFT JOIN profiles p ON r.submitted_by = p.id
            WHERE r.status = 'pending'
            ORDER BY r.created_at ASC
            LIMIT 100
        `);

        res.json(result.rows);
    })
);

router.post(
    '/admin/media-reviews/:id/approve',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const adminId = req.user!.id;
        const reviewResult = await pool.query<{
            id: string;
            musicbrainz_mbid: string;
            source_image: string;
            avatar_crop: unknown;
            profile_crop: unknown;
            public_id: string | null;
            bytes: number | null;
            width: number | null;
            height: number | null;
            format: string | null;
            submitted_by: string | null;
        }>(`
            SELECT *
            FROM artist_media_asset_reviews
            WHERE id = $1
              AND status = 'pending'
        `, [req.params.id]);

        const review = reviewResult.rows[0];
        if (!review) {
            res.status(404).json({ error: 'Pending media review not found' });
            return;
        }

        const client = await pool.connect();
        let previousSharedPublicId: string | null = null;
        try {
            await client.query('BEGIN');
            const existingAssetResult = await client.query<{ public_id: string | null }>(`
                SELECT public_id
                FROM artist_media_assets
                WHERE musicbrainz_mbid = $1
                FOR UPDATE
            `, [review.musicbrainz_mbid]);
            previousSharedPublicId = existingAssetResult.rows[0]?.public_id || null;

            await client.query(`
                INSERT INTO artist_media_assets (
                    musicbrainz_mbid, source_image, avatar_crop, profile_crop,
                    public_id, bytes, width, height, format, original_uploaded_by, uploaded_by, updated_by
                ) VALUES (
                    $1, $2, $3, $4,
                    $5, $6, $7, $8, $9, $10, $10, $11
                )
                ON CONFLICT (musicbrainz_mbid) DO UPDATE
                SET
                    source_image = EXCLUDED.source_image,
                    avatar_crop = EXCLUDED.avatar_crop,
                    profile_crop = EXCLUDED.profile_crop,
                    public_id = EXCLUDED.public_id,
                    bytes = EXCLUDED.bytes,
                    width = EXCLUDED.width,
                    height = EXCLUDED.height,
                    format = EXCLUDED.format,
                    original_uploaded_by = COALESCE(artist_media_assets.original_uploaded_by, artist_media_assets.uploaded_by, EXCLUDED.original_uploaded_by),
                    uploaded_by = EXCLUDED.uploaded_by,
                    updated_by = EXCLUDED.updated_by
            `, [
                review.musicbrainz_mbid,
                review.source_image,
                review.avatar_crop ? JSON.stringify(review.avatar_crop) : null,
                review.profile_crop ? JSON.stringify(review.profile_crop) : null,
                review.public_id,
                review.bytes,
                review.width,
                review.height,
                review.format,
                review.submitted_by,
                adminId
            ]);

            await client.query(`
                UPDATE artist_media_asset_reviews
                SET status = 'approved',
                    reviewed_by = $1,
                    reviewed_at = NOW()
                WHERE id = $2
            `, [adminId, review.id]);

            await client.query('COMMIT');

            if (previousSharedPublicId && previousSharedPublicId !== review.public_id) {
                await MediaCleanupService.deletePublicIdIfUnused(previousSharedPublicId);
            }

            res.json({ ok: true });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    })
);

router.post(
    '/admin/media-reviews/:id/reject',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const result = await pool.query(`
            UPDATE artist_media_asset_reviews
            SET status = 'rejected',
                reviewed_by = $1,
                reviewed_at = NOW()
            WHERE id = $2
              AND status = 'pending'
            RETURNING id
        `, [req.user!.id, req.params.id]);

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Pending media review not found' });
            return;
        }

        res.json({ ok: true });
    })
);

export default router;
