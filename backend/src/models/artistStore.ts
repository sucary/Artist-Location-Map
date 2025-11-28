import { Artist, CreateArtistDTO, UpdateArtistDTO } from '../types/artist';
import { randomUUID } from 'crypto';

// In-memory storage
let artists: Artist[] = [];

export const ArtistStore = {
    getAll: (): Artist[] => {
        return artists;
    },

    getById: (id: string): Artist | undefined => {
        return artists.find(a => a.id === id);
    },

    create: (data: CreateArtistDTO): Artist => {
        const newArtist: Artist = {
            id: randomUUID(),
            ...data,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        artists.push(newArtist);
        return newArtist;
    },

    update: (id: string, data: UpdateArtistDTO): Artist | undefined => {
        const index = artists.findIndex(a => a.id === id);
        if (index === -1) return undefined;

        const updatedArtist = {
            ...artists[index],
            ...data,
            updatedAt: new Date()
        };
        artists[index] = updatedArtist;
        return updatedArtist;
    },

    delete: (id: string): boolean => {
        const initialLength = artists.length;
        artists = artists.filter(a => a.id !== id);
        return artists.length !== initialLength;
    }
};