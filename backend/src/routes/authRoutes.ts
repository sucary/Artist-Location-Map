import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../middleware/authMiddleware';
import {
    checkUsernameAvailability,
    checkEmailAvailability,
    requestPasswordReset,
    getProfile,
    getPendingUsers,
    approveUser,
    rejectUser,
} from '../controllers/authController';
import { ProfileStore } from '../models/profileStore';
import pool from '../config/database';
import { asyncHandler } from '../middleware/errorHandler';
import { isValidUsername, normalizeUsername, usernameValidationMessage } from '../utils/username';

const router = Router();

const usernameAvailabilityLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: 'Too many username checks, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const emailAvailabilityLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many email checks, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const passwordResetLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 2,
    message: 'Too many password reset requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Public routes
router.get('/check-username', usernameAvailabilityLimiter, checkUsernameAvailability);
router.get('/check-email', emailAvailabilityLimiter, checkEmailAvailability);
router.post('/password-reset', passwordResetLimiter, requestPasswordReset);

// Protected routes
router.get('/profile', requireAuth, getProfile);

// Admin routes
router.get('/admin/pending-users', requireAuth, requireAdmin, getPendingUsers);
router.post('/admin/approve/:userId', requireAuth, requireAdmin, approveUser);
router.post('/admin/reject/:userId', requireAuth, requireAdmin, rejectUser);

// POST /api/auth/set-username
router.post('/set-username', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const username = normalizeUsername(req.body.username);
    const userId = req.user!.id;

    // Validate username format
    if (!isValidUsername(username)) {
        res.status(400).json({ error: usernameValidationMessage() });
        return;
    }

    // Check availability
    const available = await ProfileStore.checkUsernameAvailable(username);
    if (!available) {
        res.status(409).json({ error: 'Username already taken' });
        return;
    }

    // Update profile
    await pool.query('UPDATE profiles SET username = $1 WHERE id = $2', [username, userId]);
    res.json({ success: true });
}));

// PUT /api/auth/profile - Update profile settings
router.put('/profile', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { username, isPrivate, locationLanguage, uiLanguage, artistNameDisplayMode, tutorialCompleted } = req.body;
    let normalizedUsername: string | undefined;

    // Validate username if provided
    if (username !== undefined) {
        const nextUsername = normalizeUsername(username);
        if (!isValidUsername(nextUsername)) {
            res.status(400).json({ error: usernameValidationMessage() });
            return;
        }
        normalizedUsername = nextUsername;

        // Check if username changed and is available
        const currentProfile = await ProfileStore.getByUserId(userId);
        if (currentProfile?.username !== normalizedUsername) {
            const available = await ProfileStore.checkUsernameAvailable(normalizedUsername);
            if (!available) {
                res.status(409).json({ error: 'Username already taken' });
                return;
            }
        }
    }

    // Validate locationLanguage if provided
    const validLanguages = ['en', 'zhHans', 'zhHant', 'ja', 'native'];
    if (locationLanguage !== undefined && !validLanguages.includes(locationLanguage)) {
        res.status(400).json({ error: `locationLanguage must be one of: ${validLanguages.join(', ')}` });
        return;
    }

    const validUiLanguages = ['en', 'zh', 'zh-Hant', 'ja'];
    if (uiLanguage !== undefined && !validUiLanguages.includes(uiLanguage)) {
        res.status(400).json({ error: `uiLanguage must be one of: ${validUiLanguages.join(', ')}` });
        return;
    }

    const validArtistNameDisplayModes = ['main', 'sub', 'both', 'subFirst'];
    if (artistNameDisplayMode !== undefined && !validArtistNameDisplayModes.includes(artistNameDisplayMode)) {
        res.status(400).json({ error: `artistNameDisplayMode must be one of: ${validArtistNameDisplayModes.join(', ')}` });
        return;
    }

    if (tutorialCompleted !== undefined && typeof tutorialCompleted !== 'boolean') {
        res.status(400).json({ error: 'tutorialCompleted must be a boolean' });
        return;
    }

    // Update profile
    await ProfileStore.updateProfile(userId, { username: normalizedUsername, isPrivate, locationLanguage, uiLanguage, artistNameDisplayMode, tutorialCompleted });

    // Return updated profile
    const updatedProfile = await ProfileStore.getByUserId(userId);
    res.json(updatedProfile);
}));

export default router;
