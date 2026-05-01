import { Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { NotificationStore } from '../models/notificationStore';

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
