import { Router } from 'express';
import {
    getAllArtists,
    getArtistById,
    createArtist,
    updateArtist,
    deleteArtist
} from '../controllers/artistController';

const router = Router();

// GET /api/artists
router.get('/', getAllArtists);

// GET /api/artists/:id
router.get('/:id', getArtistById);

// POST /api/artists
router.post('/', createArtist);

// PUT /api/artists/:id
router.put('/:id', updateArtist);

// DELETE /api/artists/:id
router.delete('/:id', deleteArtist);

export default router;