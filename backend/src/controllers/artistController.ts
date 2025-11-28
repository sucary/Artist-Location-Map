import { Request, Response } from 'express';
import { ArtistStore } from '../models/artistStore';
import { CreateArtistDTO, UpdateArtistDTO, ArtistQueryParams } from '../types/artist';
import { isValidLocation, isValidSocialLinks } from '../types/validation';

export const getAllArtists = (req: Request, res: Response) => {
    const filters: ArtistQueryParams = req.query;
    let artists = ArtistStore.getAll();

    if (filters.name) {
        const nameQuery = filters.name.toLowerCase();
        artists = artists.filter(a => a.name.toLowerCase().includes(nameQuery));
    }

    if (filters.city) {
        const cityQuery = filters.city.toLowerCase();
        artists = artists.filter(a => {
            const location = filters.view === 'active' ? a.activeLocation : a.originalLocation;
            return location.city.toLowerCase().includes(cityQuery);
        });
    }

    if (filters.province) {
        const provinceQuery = filters.province.toLowerCase();
        artists = artists.filter(a => {
            const location = filters.view === 'active' ? a.activeLocation : a.originalLocation;
            return location.province.toLowerCase().includes(provinceQuery);
        });
    }

    res.json(artists);
};

export const getArtistById = (req: Request, res: Response) => {
    const artist = ArtistStore.getById(req.params.id);
    if (!artist) {
        res.status(404).json({ message: 'Artist not found' });
        return;
    }
    res.json(artist);
};

export const createArtist = (req: Request, res: Response) => {
    const data: CreateArtistDTO = req.body;

    // Validation
    if (!data.name || !data.originalLocation || !data.activeLocation) {
        res.status(400).json({ message: 'Missing required fields' });
        return;
    }

    if (!isValidLocation(data.originalLocation) || !isValidLocation(data.activeLocation)) {
        res.status(400).json({ message: 'Invalid location data' });
        return;
    }

    if (data.socialLinks && !isValidSocialLinks(data.socialLinks)) {
        res.status(400).json({ message: 'Invalid social links' });
        return;
    }

    const newArtist = ArtistStore.create(data);
    res.status(201).json(newArtist);
};

export const updateArtist = (req: Request, res: Response) => {
    const data: UpdateArtistDTO = req.body;
    
    // Validation for provided fields
    if (data.originalLocation && !isValidLocation(data.originalLocation)) {
        res.status(400).json({ message: 'Invalid original location data' });
        return;
    }

    if (data.activeLocation && !isValidLocation(data.activeLocation)) {
        res.status(400).json({ message: 'Invalid active location data' });
        return;
    }

    if (data.socialLinks && !isValidSocialLinks(data.socialLinks)) {
        res.status(400).json({ message: 'Invalid social links' });
        return;
    }

    const updatedArtist = ArtistStore.update(req.params.id, data);
    if (!updatedArtist) {
        res.status(404).json({ message: 'Artist not found' });
        return;
    }

    res.json(updatedArtist);
};

export const deleteArtist = (req: Request, res: Response) => {
    const success = ArtistStore.delete(req.params.id);
    if (!success) {
        res.status(404).json({ message: 'Artist not found' });
        return;
    }
    res.status(204).send();
};