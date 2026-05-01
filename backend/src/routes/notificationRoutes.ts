import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import {
    clearNotifications,
    deleteNotification,
    listNotifications,
    markNotificationsRead
} from '../controllers/notificationController';

const router = Router();

router.get('/', requireAuth, listNotifications);
router.post('/mark-read', requireAuth, markNotificationsRead);
router.delete('/', requireAuth, clearNotifications);
router.delete('/:id', requireAuth, deleteNotification);

export default router;
