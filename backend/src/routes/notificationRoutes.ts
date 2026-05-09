import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/authMiddleware';
import {
    clearNotifications,
    deleteAdminPinnedNotification,
    deleteNotification,
    listAdminPinnedNotifications,
    listNotifications,
    markNotificationsRead,
    postAdminNotification,
    searchNotificationRecipients
} from '../controllers/notificationController';

const router = Router();

router.get('/', requireAuth, listNotifications);
router.get('/admin/pinned', requireAuth, requireAdmin, listAdminPinnedNotifications);
router.get('/admin/recipients', requireAuth, requireAdmin, searchNotificationRecipients);
router.post('/admin', requireAuth, requireAdmin, postAdminNotification);
router.post('/mark-read', requireAuth, markNotificationsRead);
router.delete('/', requireAuth, clearNotifications);
router.delete('/admin/pinned/:id', requireAuth, requireAdmin, deleteAdminPinnedNotification);
router.delete('/:id', requireAuth, deleteNotification);

export default router;
