import { Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { NotificationService } from '../services/notificationService';

const MAX_MESSAGE_LENGTH = 2000;

export const submitFeedback = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rawMessage = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

    if (!rawMessage) {
        throw new AppError('Feedback message is required', 400);
    }
    if (rawMessage.length > MAX_MESSAGE_LENGTH) {
        throw new AppError(`Feedback must be ${MAX_MESSAGE_LENGTH} characters or fewer`, 400);
    }

    const senderEmail = req.user!.email || 'Anonymous user';

    // Notification content renders [label](url) as links; break that pattern so
    // untrusted feedback text can't inject clickable links into admin notifications.
    const safeMessage = rawMessage.replace(/]\(/g, '] (');

    // Deliver feedback to every admin as a notification.
    await NotificationService.createForAdmins({
        type: 'feedback',
        title: 'New feedback',
        content: `${senderEmail}: ${safeMessage}`,
        metadata: {
            feedbackUserId: req.user!.id,
            feedbackEmail: req.user!.email || null,
        },
    });

    res.status(201).json({ ok: true });
});
