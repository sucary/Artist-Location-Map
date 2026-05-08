import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { ProfileStore } from '../models/profileStore';
import { NotificationService } from '../services/notificationService';
import { supabaseAdmin } from '../config/supabase';

export const checkUsernameAvailability = asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.query;

    if (!username || typeof username !== 'string') {
        res.status(400).json({ error: 'Username required' });
        return;
    }

    const available = await ProfileStore.checkUsernameAvailable(username);
    res.json({ available });
});

export const checkEmailAvailability = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.query;

    if (!email || typeof email !== 'string') {
        res.status(400).json({ error: 'Email required' });
        return;
    }

    const available = await ProfileStore.checkEmailAvailable(email);
    res.json({ available });
});

export const requestPasswordReset = asyncHandler(async (req: Request, res: Response) => {
    const { email, redirectTo } = req.body;

    if (!email || typeof email !== 'string') {
        res.status(400).json({ error: 'Email required' });
        return;
    }

    const hasPasswordIdentity = await ProfileStore.emailHasPasswordIdentity(email);

    if (hasPasswordIdentity) {
        const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
            redirectTo: typeof redirectTo === 'string' ? redirectTo : undefined,
        });

        if (error) {
            console.error('Password reset request failed:', error.message);
        }
    }

    res.json({ success: true });
});

export const getProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const profile = await ProfileStore.getByUserId(userId);

    if (!profile) {
        res.status(404).json({ error: 'Profile not found' });
        return;
    }

    res.json(profile);
});

export const getPendingUsers = asyncHandler(async (_req: Request, res: Response) => {
    const pendingUsers = await ProfileStore.getPendingUsers();
    res.json(pendingUsers);
});

export const approveUser = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!userId) {
        res.status(400).json({ error: 'User ID required' });
        return;
    }

    await ProfileStore.approveUser(userId);
    await NotificationService.createForUser(userId, {
        type: 'registration_approved',
        title: 'Account approved',
        content: 'Your account has been approved. You can now add and edit artists.',
        aggregationKey: 'registration_approved'
    });

    res.json({ message: 'User approved successfully' });
});

export const rejectUser = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!userId) {
        res.status(400).json({ error: 'User ID required' });
        return;
    }

    await ProfileStore.rejectUser(userId);
    res.json({ message: 'User rejected and removed' });
});

