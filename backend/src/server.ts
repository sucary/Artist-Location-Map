import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import artistRoutes from './routes/artistRoutes';
import cityRoutes from './routes/cityRoutes';
import authRoutes from './routes/authRoutes';
import searchRoutes from './routes/searchRoutes';
import uploadRoutes from './routes/uploadRoutes';
import musicbrainzCatalogRoutes from './routes/musicbrainzCatalogRoutes';
import notificationRoutes from './routes/notificationRoutes';
import gigRoutes from './routes/gigRoutes';
import venueRoutes from './routes/venueRoutes';
import feedbackRoutes from './routes/feedbackRoutes';
import { errorHandler } from './middleware/errorHandler';
import { verifyDatabaseConnection } from './config/database';
import { AuthCleanupService } from './services/authCleanupService';

const app = express();
const PORT = process.env.PORT || 5000;
const SIGNUP_CONFIRMATION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

function startSignupConfirmationCleanup(): void {
    const runCleanup = async () => {
        try {
            const result = await AuthCleanupService.cleanupExpiredSignupConfirmations();
            if (result.deletedCount > 0) {
                console.log(`Removed ${result.deletedCount} expired signup confirmation user(s)`);
            }
        } catch (error) {
            console.error('Expired signup confirmation cleanup failed:', error);
        }
    };

    // Keep stale unconfirmed registrations from reserving emails
    const intervalId = setInterval(() => {
        void runCleanup();
    }, SIGNUP_CONFIRMATION_CLEANUP_INTERVAL_MS);
    intervalId.unref?.();

    void runCleanup();
}

// Trust only the first proxy
app.set('trust proxy', 1);

// Security Headers
app.use(helmet());

app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500,
    message: 'Too many requests from this IP, please try again later',
    skip: (req) => req.method === 'OPTIONS'
});
app.use(limiter);
app.use(express.json());

app.use('/api/artists', artistRoutes);
app.use('/api/cities', cityRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/musicbrainz-catalog', musicbrainzCatalogRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/gigs', gigRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/feedback', feedbackRoutes);

app.get('/api/health', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        message: 'running',
        timestamp: new Date().toISOString()
    });
});

// Global Error Handler
app.use(errorHandler);

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await verifyDatabaseConnection();
    startSignupConfirmationCleanup();
});
