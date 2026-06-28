import { Router } from 'express';
import {
    getAllArtists,
    getArtistsByUsername,
    copyArtistsByUsername,
    copyArtistById,
    getArtistById,
    createArtist,
    updateArtist,
    deleteArtist,
    getArtistCountByCity,
    getArtistCountByUsername,
    getFeaturedArtistsEndpoint
} from '../controllers/artistController';
import { requireAuth, requireApproval, optionalAuth } from '../middleware/authMiddleware';

const router = Router();

// Public routes
router.get('/', optionalAuth, getAllArtists);
router.get('/featured', getFeaturedArtistsEndpoint);
router.get('/stats/by-city', optionalAuth, getArtistCountByCity);

// View other user's map (public profiles visible to all, private to self/admin)
router.get('/u/:username', optionalAuth, getArtistsByUsername);
router.get('/u/:username/stats/by-city', optionalAuth, getArtistCountByUsername);
router.post('/u/:username/copy', requireAuth, requireApproval, copyArtistsByUsername);

// Protected route - requires auth to view individual artist
router.get('/:id', requireAuth, getArtistById);

// Protected routes - require approval for mutations
router.post('/', requireAuth, requireApproval, createArtist);
router.post('/:id/copy', requireAuth, requireApproval, copyArtistById);
router.put('/:id', requireAuth, requireApproval, updateArtist);
router.delete('/:id', requireAuth, requireApproval, deleteArtist);

export default router;
