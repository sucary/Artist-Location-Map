import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { ProfileStore } from '../models/profileStore';
import { NotificationService } from '../services/notificationService';
import { supabaseAdmin } from '../config/supabase';
import { isValidUsername, normalizeUsername, usernameValidationMessage } from '../utils/username';

// Authentication profile and password reset handlers

const AUTH_EMAIL_LIMIT_ERROR_PATTERNS = [
    'rate limit',
    'rate-limit',
    'too many',
    'quota',
    'daily limit',
    'email rate',
    'limit exceeded',
    'exceeded'
];

function isAuthEmailLimitError(message: string): boolean {
    const normalizedMessage = message.toLowerCase();
    return AUTH_EMAIL_LIMIT_ERROR_PATTERNS.some((pattern) => normalizedMessage.includes(pattern));
}

function getAllowedRedirectOrigins(): Set<string> {
    const configuredOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
    return new Set(
        configuredOrigin
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean)
    );
}

function normalizePasswordResetRedirect(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;

    try {
        // Limit password reset redirects to configured frontend origins
        const url = new URL(value);
        if (!getAllowedRedirectOrigins().has(url.origin)) return undefined;
        return url.toString();
    } catch {
        return undefined;
    }
}

export const checkUsernameAvailability = asyncHandler(async (req: Request, res: Response) => {
    const username = normalizeUsername(req.query.username);

    if (!isValidUsername(username)) {
        res.status(400).json({ error: usernameValidationMessage() });
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

    const safeRedirectTo = normalizePasswordResetRedirect(redirectTo);
    if (redirectTo !== undefined && !safeRedirectTo) {
        res.status(400).json({ error: 'Invalid password reset redirect URL' });
        return;
    }

    const hasPasswordIdentity = await ProfileStore.emailHasPasswordIdentity(email);

    if (hasPasswordIdentity) {
        const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
            redirectTo: safeRedirectTo,
        });

        if (error) {
            console.error('Password reset request failed:', error.message);
            if (isAuthEmailLimitError(error.message)) {
                res.status(429).json({ error: 'The daily password reset email limit has been reached. Please try again later.' });
                return;
            }
        }
    }

    res.json({ success: true });
});

export const getProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const profile = await ProfileStore.getByUserId(userId);

    if (!profile) {
        // Profile row may have been deleted — recreate it from the auth user
        profile = await ProfileStore.createProfile(userId, req.user!.email);
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

