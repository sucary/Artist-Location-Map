import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/authMiddleware';
import {
    clearNotifications,
    deleteNotification,
    listNotifications,
    markNotificationsRead,
    postAdminNotification,
    searchNotificationRecipients
} from '../controllers/notificationController';

const router = Router();

router.get('/', requireAuth, listNotifications);
router.get('/admin/recipients', requireAuth, requireAdmin, searchNotificationRecipients);
router.post('/admin', requireAuth, requireAdmin, postAdminNotification);
router.post('/mark-read', requireAuth, markNotificationsRead);
router.delete('/', requireAuth, clearNotifications);
router.delete('/:id', requireAuth, deleteNotification);

export default router;
