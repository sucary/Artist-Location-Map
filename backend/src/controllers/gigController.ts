import { Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { GigInputSchema, GigQuerySchema, GigUpdateSchema, TourInputSchema, TourUpdateSchema } from '../schemas/gigValidation';
import { GigService } from '../services/gigService';

// Gig API controllers with private owner scoping

export const listGigs = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const query = GigQuerySchema.parse(req.query);
    const gigs = await GigService.getAll({
        userId: req.user!.id,
        from: query.from,
        to: query.to,
        q: query.q,
    });
    res.json(gigs);
});

export const listArtistGigs = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const isAdmin = req.profile?.isAdmin ?? false;
    const gigs = await GigService.getByArtist(req.params.artistId, req.user!.id, isAdmin);
    res.json(gigs);
});

export const createGig = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = GigInputSchema.parse(req.body);
    const isAdmin = req.profile?.isAdmin ?? false;

    try {
        const gig = await GigService.create(data, req.user!.id, isAdmin);
        res.status(201).json(gig);
    } catch (error) {
        if (error instanceof Error && error.message.includes('Artist not found')) {
            throw new AppError('Artist not found', 404);
        }
        if (error instanceof Error && error.message.includes('location')) {
            throw new AppError(error.message, 400);
        }
        throw error;
    }
});

export const updateGig = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = GigUpdateSchema.parse(req.body);
    const isAdmin = req.profile?.isAdmin ?? false;

    try {
        const gig = await GigService.update(req.params.id, data, req.user!.id, isAdmin);
        if (!gig) {
            throw new AppError('Gig not found', 404);
        }
        res.json(gig);
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error instanceof Error && error.message.includes('Artist not found')) {
            throw new AppError('Artist not found', 404);
        }
        if (error instanceof Error && error.message.includes('location')) {
            throw new AppError(error.message, 400);
        }
        throw error;
    }
});

export const deleteGig = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const isAdmin = req.profile?.isAdmin ?? false;
    const deleted = await GigService.delete(req.params.id, req.user!.id, isAdmin);
    if (!deleted) {
        throw new AppError('Gig not found', 404);
    }
    res.status(204).send();
});

export const listTours = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tours = await GigService.getTours(req.user!.id);
    res.json(tours);
});

export const createTour = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = TourInputSchema.parse(req.body);
    const isAdmin = req.profile?.isAdmin ?? false;

    try {
        const tour = await GigService.createTour(data, req.user!.id, isAdmin);
        res.status(201).json(tour);
    } catch (error) {
        if (error instanceof Error && error.message.includes('Artist not found')) {
            throw new AppError('Artist not found', 404);
        }
        throw error;
    }
});

export const updateTour = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = TourUpdateSchema.parse(req.body);
    const isAdmin = req.profile?.isAdmin ?? false;

    try {
        const tour = await GigService.updateTour(req.params.id, data, req.user!.id, isAdmin);
        if (!tour) {
            throw new AppError('Tour not found', 404);
        }
        res.json(tour);
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error instanceof Error && error.message.includes('Artist not found')) {
            throw new AppError('Artist not found', 404);
        }
        throw error;
    }
});

export const deleteTour = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const isAdmin = req.profile?.isAdmin ?? false;
    const deleted = await GigService.deleteTour(req.params.id, req.user!.id, isAdmin);
    if (!deleted) {
        throw new AppError('Tour not found', 404);
    }
    res.status(204).send();
});
