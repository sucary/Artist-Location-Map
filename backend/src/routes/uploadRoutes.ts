import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { requireAuth, requireApproval, requireAdmin, AuthenticatedRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../middleware/errorHandler';
import cloudinary from '../config/cloudinary';
import pool from '../config/database';
import { MediaCleanupService } from '../services/mediaCleanupService';
import { NotificationService } from '../services/notificationService';

// Signed media upload routes and shared artist image review actions

const router = Router();
const NORMAL_USER_DAILY_UPLOAD_LIMIT = 25;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const LANDSCAPE_MAX_WIDTH = 1280;
const LANDSCAPE_MAX_HEIGHT = 720;
const PORTRAIT_MAX_WIDTH = 720;
const PORTRAIT_MAX_HEIGHT = 1280;
const SQUARE_MAX_DIMENSION = 720;
const ALLOWED_IMAGE_FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp']);

function isExpectedCloudinaryUrl(secureUrl: string, publicId: string): boolean {
    try {
        const url = new URL(secureUrl);
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        if (!cloudName || url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com') {
            return false;
        }

        const pathParts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
        const uploadIndex = pathParts.indexOf('upload');
        if (
            pathParts[0] !== cloudName ||
            pathParts[1] !== 'image' ||
            uploadIndex === -1
        ) {
            return false;
        }

        const assetPath = pathParts
            .slice(uploadIndex + 1)
            .filter((part) => !/^v\d+$/.test(part))
            .join('/');
        // Compare Cloudinary public IDs without the delivery extension
        const assetPathWithoutExtension = assetPath.replace(/\.[a-z0-9]+$/i, '');

        return assetPathWithoutExtension === publicId;
    } catch {
        return false;
    }
}

function isAllowedImageResolution(width?: number, height?: number): boolean {
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
        return true;
    }

    const imageWidth = width!;
    const imageHeight = height!;

    if (imageWidth === imageHeight) {
        return imageWidth <= SQUARE_MAX_DIMENSION;
    }

    return imageWidth > imageHeight
        ? imageWidth <= LANDSCAPE_MAX_WIDTH && imageHeight <= LANDSCAPE_MAX_HEIGHT
        : imageWidth <= PORTRAIT_MAX_WIDTH && imageHeight <= PORTRAIT_MAX_HEIGHT;
}

async function rejectAndDeleteUpload(publicId: string, message: string, res: Response) {
    await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image'
    }).catch((error) => {
        console.error('Failed to delete rejected Cloudinary upload:', error);
    });

    await pool.query(`
        UPDATE media_upload_events
        SET status = 'deleted'
        WHERE public_id = $1
    `, [publicId]);

    res.status(400).json({ error: message });
}

router.get(
    '/artist-media/:mbid',
    requireAuth,
    requireApproval,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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
        const hasAsset = Boolean(asset);
        const canUseSharedMedia = isAdmin;

        res.json({
            hasAsset: canUseSharedMedia && hasAsset,
            sourceImage: canUseSharedMedia ? asset?.source_image || null : null,
            avatarCrop: canUseSharedMedia ? asset?.avatar_crop || null : null,
            profileCrop: canUseSharedMedia ? asset?.profile_crop || null : null,
            canReplaceDirectly: true,
            requiresReview: false
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
                  AND status IN ('signed', 'uploaded')
            `, [userId]);

            const uploadCount = Number(quotaResult.rows[0]?.count || 0);
            if (uploadCount >= NORMAL_USER_DAILY_UPLOAD_LIMIT) {
                res.status(429).json({
                    error: 'Daily upload limit reached',
                    message: `You can request up to ${NORMAL_USER_DAILY_UPLOAD_LIMIT} image uploads per 24 hours.`
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

        const expectedPrefix = `artist_uploads/${userId}/`;
        if (!publicId.startsWith(expectedPrefix)) {
            res.status(403).json({ error: 'Invalid upload owner' });
            return;
        }

        if (!isExpectedCloudinaryUrl(secureUrl, publicId)) {
            res.status(400).json({ error: 'Upload URL does not match the signed Cloudinary public ID' });
            return;
        }

        const reservationResult = await pool.query<{ id: string }>(`
            SELECT id
            FROM media_upload_events
            WHERE public_id = $1
              AND user_id = $2
              AND status = 'signed'
            LIMIT 1
        `, [publicId, userId]);

        if (reservationResult.rows.length === 0) {
            res.status(404).json({ error: 'Upload reservation not found' });
            return;
        }

        if (Number.isFinite(bytes) && bytes! > MAX_IMAGE_BYTES) {
            await rejectAndDeleteUpload(publicId, 'Image size must be smaller than 5 MB', res);
            return;
        }

        if (!isAllowedImageResolution(width, height)) {
            await rejectAndDeleteUpload(publicId, 'Image resolution must fit within 1920x1080 or 1080x1920', res);
            return;
        }

        if (format && !ALLOWED_IMAGE_FORMATS.has(format.toLowerCase())) {
            await rejectAndDeleteUpload(publicId, 'Only JPG, PNG, and WebP images are allowed', res);
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
            artist_name: string | null;
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
            SELECT r.*, a.name as artist_name
            FROM artist_media_asset_reviews r
            LEFT JOIN musicbrainz_artists a ON a.mbid = r.musicbrainz_mbid
            WHERE r.id = $1
              AND r.status = 'pending'
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

            await NotificationService.createForUser(review.submitted_by, {
                type: 'artist_media_approved',
                title: 'Artist image approved',
                content: `${review.artist_name || 'Your artist image'} was approved.`,
                linkLabel: 'View artist',
                linkUrl: `/artists/${review.musicbrainz_mbid}`,
                aggregationKey: `artist_media_approved:${review.musicbrainz_mbid}`,
                metadata: {
                    musicbrainzMbid: review.musicbrainz_mbid,
                    reviewId: review.id
                }
            });

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
        const result = await pool.query<{
            id: string;
            musicbrainz_mbid: string;
            submitted_by: string | null;
            artist_name: string | null;
        }>(`
            UPDATE artist_media_asset_reviews
            SET status = 'rejected',
                reviewed_by = $1,
                reviewed_at = NOW()
            WHERE id = $2
              AND status = 'pending'
            RETURNING
                id,
                musicbrainz_mbid,
                submitted_by,
                (
                    SELECT name
                    FROM musicbrainz_artists
                    WHERE musicbrainz_artists.mbid = artist_media_asset_reviews.musicbrainz_mbid
                ) as artist_name
        `, [req.user!.id, req.params.id]);

        const review = result.rows[0];
        if (!review) {
            res.status(404).json({ error: 'Pending media review not found' });
            return;
        }

        await NotificationService.createForUser(review.submitted_by, {
            type: 'artist_media_rejected',
            title: 'Artist image rejected',
            content: `${review.artist_name || 'Your artist image'} was rejected.`,
            linkLabel: 'View artist',
            linkUrl: `/artists/${review.musicbrainz_mbid}`,
            aggregationKey: `artist_media_rejected:${review.musicbrainz_mbid}`,
            metadata: {
                musicbrainzMbid: review.musicbrainz_mbid,
                reviewId: review.id
            }
        });

        res.json({ ok: true });
    })
);

export default router;
