import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/authMiddleware';
import { submitFeedback } from '../controllers/feedbackController';

const router = Router();

const feedbackLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    message: 'Too many feedback submissions, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/', requireAuth, feedbackLimiter, submitFeedback);

export default router;
