import { Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { NotificationStore } from '../models/notificationStore';
import { ProfileStore } from '../models/profileStore';
import { NotificationService } from '../services/notificationService';

const MAX_TITLE_LENGTH = 120;
const MAX_CONTENT_LENGTH = 1000;
const ADMIN_NOTIFICATION_TYPE = 'admin_message';

type AdminNotificationAudience = 'all' | 'user';

interface AdminNotificationRequestBody {
    audience?: unknown;
    userId?: unknown;
    title?: unknown;
    content?: unknown;
    isHard?: unknown;
}

type AdminNotificationValidationResult =
    | {
        ok: true;
        value: {
            audience: AdminNotificationAudience;
            userId?: string;
            title: string;
            content: string;
            isHard: boolean;
        };
    }
    | { ok: false; status: number; error: string };

function normalizeOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function validateAdminNotificationInput(body: AdminNotificationRequestBody): AdminNotificationValidationResult {
    const normalizedTitle = normalizeOptionalString(body.title);
    const normalizedContent = normalizeOptionalString(body.content);

    // Require a supported audience before resolving recipients.
    if (body.audience !== 'all' && body.audience !== 'user') {
        return { ok: false, status: 400, error: 'Audience must be all or user' };
    }

    // Keep admin-authored notifications compact enough for the header menu.
    if (!normalizedTitle || normalizedTitle.length > MAX_TITLE_LENGTH) {
        return {
            ok: false,
            status: 400,
            error: `Title is required and must be ${MAX_TITLE_LENGTH} characters or fewer`
        };
    }

    // Store content as plain text; render only the allowed inline-link pattern on the client.
    if (!normalizedContent || normalizedContent.length > MAX_CONTENT_LENGTH) {
        return {
            ok: false,
            status: 400,
            error: `Content is required and must be ${MAX_CONTENT_LENGTH} characters or fewer`
        };
    }

    // Require an explicit recipient only when the post targets one user.
    if (body.audience === 'user' && (typeof body.userId !== 'string' || body.userId.length === 0)) {
        return { ok: false, status: 400, error: 'Recipient is required' };
    }

    return {
        ok: true,
        value: {
            audience: body.audience,
            userId: typeof body.userId === 'string' ? body.userId : undefined,
            title: normalizedTitle,
            content: normalizedContent,
            isHard: body.isHard === true
        }
    };
}

export const listNotifications = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const notifications = await NotificationStore.listForUser(userId);
    res.json(notifications);
});

export const markNotificationsRead = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const ids = Array.isArray(req.body.ids)
        ? req.body.ids.filter((id: unknown): id is string => typeof id === 'string')
        : [];

    const updated = await NotificationStore.markRead(userId, ids);
    res.json({ updated });
});

export const deleteNotification = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const result = await NotificationStore.deleteForUser(userId, req.params.id);

    if (result === 'missing') {
        res.status(404).json({ error: 'Notification not found' });
        return;
    }

    if (result === 'hard') {
        res.status(409).json({ error: 'Hard notifications cannot be closed' });
        return;
    }

    res.json({ deleted: 1 });
});

export const clearNotifications = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const result = await NotificationStore.clearCloseableForUser(userId);
    res.json(result);
});

export const searchNotificationRecipients = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const recipients = await ProfileStore.searchNotificationRecipients(query);
    res.json(recipients);
});

export const postAdminNotification = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const validation = validateAdminNotificationInput(req.body as AdminNotificationRequestBody);
    if (!validation.ok) {
        res.status(validation.status).json({ error: validation.error });
        return;
    }

    const { audience, userId, title, content, isHard } = validation.value;
    const input = {
        type: ADMIN_NOTIFICATION_TYPE,
        title,
        content,
        isHard,
        linkLabel: null,
        linkUrl: null,
        metadata: {
            createdByAdminId: req.user!.id
        }
    };

    if (audience === 'user') {
        // Verify the selected recipient still exists before inserting a notification row.
        const recipient = await ProfileStore.getByUserId(userId!);
        if (!recipient) {
            res.status(404).json({ error: 'Recipient not found' });
            return;
        }

        const notification = await NotificationService.createForUser(userId, input);
        res.status(201).json({ sent: notification ? 1 : 0 });
        return;
    }

    const userIds = await ProfileStore.getAllNotificationRecipientIds();
    await NotificationService.createForUsers(userIds, input);
    res.status(201).json({ sent: userIds.length });
});
