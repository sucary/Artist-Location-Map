import { Router, Response } from 'express';
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

const router = Router();

// Public routes
router.get('/check-username', checkUsernameAvailability);
router.get('/check-email', checkEmailAvailability);
router.post('/password-reset', requestPasswordReset);

// Protected routes
router.get('/profile', requireAuth, getProfile);

// Admin routes
router.get('/admin/pending-users', requireAuth, requireAdmin, getPendingUsers);
router.post('/admin/approve/:userId', requireAuth, requireAdmin, approveUser);
router.post('/admin/reject/:userId', requireAuth, requireAdmin, rejectUser);

// POST /api/auth/set-username
router.post('/set-username', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { username } = req.body;
    const userId = req.user!.id;

    // Validate username format
    if (!username || username.length < 1 || !/^[a-zA-Z0-9_]+$/.test(username)) {
        res.status(400).json({ error: 'Username must contain letters, numbers, or underscores only' });
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
    const { username, isPrivate, locationLanguage, tutorialCompleted } = req.body;

    // Validate username if provided
    if (username !== undefined) {
        if (!username || username.length < 1 || !/^[a-zA-Z0-9_]+$/.test(username)) {
            res.status(400).json({ error: 'Username must contain letters, numbers, or underscores only' });
            return;
        }

        // Check if username changed and is available
        const currentProfile = await ProfileStore.getByUserId(userId);
        if (currentProfile?.username !== username) {
            const available = await ProfileStore.checkUsernameAvailable(username);
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

    if (tutorialCompleted !== undefined && typeof tutorialCompleted !== 'boolean') {
        res.status(400).json({ error: 'tutorialCompleted must be a boolean' });
        return;
    }

    // Update profile
    await ProfileStore.updateProfile(userId, { username, isPrivate, locationLanguage, tutorialCompleted });

    // Return updated profile
    const updatedProfile = await ProfileStore.getByUserId(userId);
    res.json(updatedProfile);
}));

export default router;
