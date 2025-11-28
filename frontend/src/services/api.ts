import axios from 'axios';
import type { Artist, ArtistQueryParams } from '../types/artist';

const API_URL = 'http://localhost:5000/api';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const checkHealth = async () => {
    try {
        const response = await api.get('/health');
        return response.data;
    } catch (error) {
        console.error('Health check failed:', error);
        throw error;
    }
};

export const getArtists = async (params?: ArtistQueryParams): Promise<Artist[]> => {
    try {
        const response = await api.get<Artist[]>('/artists', { params });
        return response.data;
    } catch (error) {
        console.error('Failed to fetch artists:', error);
        throw error;
    }
};

export default api;