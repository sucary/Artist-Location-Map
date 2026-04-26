import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { requireAuth, requireApproval, AuthenticatedRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../middleware/errorHandler';
import cloudinary from '../config/cloudinary';
import pool from '../config/database';

const router = Router();
const NORMAL_USER_DAILY_UPLOAD_LIMIT = 50;

router.get(
    '/artist-media/:mbid',
    requireAuth,
    requireApproval,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const result = await pool.query<{ source_image: string }>(`
            SELECT source_image
            FROM artist_media_assets
            WHERE musicbrainz_mbid = $1
        `, [req.params.mbid]);

        res.json({
            hasAsset: result.rows.length > 0,
            sourceImage: result.rows[0]?.source_image || null
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

export default router;
