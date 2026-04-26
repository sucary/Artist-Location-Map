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
import { errorHandler } from './middleware/errorHandler';
import { verifyDatabaseConnection } from './config/database';

const app = express();
const PORT = process.env.PORT || 5000;

// Trust only the first proxy
app.set('trust proxy', 1);

// Security Headers
app.use(helmet());

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500,
    message: 'Too many requests from this IP, please try again later'
});
app.use(limiter);

app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

app.use('/api/artists', artistRoutes);
app.use('/api/cities', cityRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/musicbrainz-catalog', musicbrainzCatalogRoutes);

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
});
