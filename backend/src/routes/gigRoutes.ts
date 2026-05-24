import { Router } from 'express';
import { createGig, createTour, deleteGig, deleteTour, listArtistGigs, listGigs, listTours, updateGig, updateTour } from '../controllers/gigController';
import { requireApproval, requireAuth } from '../middleware/authMiddleware';

const router = Router();

// Private gig routes
router.get('/', requireAuth, listGigs);
router.get('/artist/:artistId', requireAuth, listArtistGigs);
router.get('/tours', requireAuth, listTours);
router.post('/tours', requireAuth, requireApproval, createTour);
router.put('/tours/:id', requireAuth, requireApproval, updateTour);
router.delete('/tours/:id', requireAuth, requireApproval, deleteTour);
router.post('/', requireAuth, requireApproval, createGig);
router.put('/:id', requireAuth, requireApproval, updateGig);
router.delete('/:id', requireAuth, requireApproval, deleteGig);

export default router;
