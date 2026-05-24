import axios from 'axios';
import type { Artist, ArtistQueryParams, LocalizedChain } from '../types/artist';
import type { City } from '../types/city';
import type { MainSearchResponse } from '../types/search';
import type { Profile } from '../types/profile';
import type { Gig, GigInput, GigQueryParams, Tour, TourInput } from '../types/gig';
import { supabase } from '../lib/supabase';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
    }
    return config;
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

export const getArtistsByUsername = async (username: string, params?: ArtistQueryParams): Promise<Artist[]> => {
    try {
        const response = await api.get<Artist[]>(`/artists/u/${username}`, { params });
        return response.data;
    } catch (error) {
        console.error('Failed to fetch artists by username:', error);
        throw error;
    }
};

export interface CopyArtistCollectionResult {
    total: number;
    copied: number;
    skipped: number;
    skippedMusicBrainz: number;
    skippedCustom: number;
}

export const copyArtistCollectionByUsername = async (username: string): Promise<CopyArtistCollectionResult> => {
    try {
        const response = await api.post<CopyArtistCollectionResult>(`/artists/u/${username}/copy`);
        return response.data;
    } catch (error) {
        console.error('Failed to copy artist collection:', error);
        throw error;
    }
};

export const getFeaturedArtists = async (): Promise<Artist[]> => {
    try {
        const response = await api.get<Artist[]>('/artists/featured');
        return response.data;
    } catch (error) {
        console.error('Failed to fetch featured artists:', error);
        throw error;
    }
};

export const getGigs = async (params?: GigQueryParams): Promise<Gig[]> => {
    const response = await api.get<Gig[]>('/gigs', { params });
    return response.data;
};

export const getArtistGigs = async (artistId: string): Promise<Gig[]> => {
    const response = await api.get<Gig[]>(`/gigs/artist/${artistId}`);
    return response.data;
};

export const getTours = async (): Promise<Tour[]> => {
    const response = await api.get<Tour[]>('/gigs/tours');
    return response.data;
};

export const createTour = async (tourData: TourInput): Promise<Tour> => {
    const response = await api.post<Tour>('/gigs/tours', tourData);
    return response.data;
};

export const createGig = async (gigData: GigInput): Promise<Gig> => {
    const response = await api.post<Gig>('/gigs', gigData);
    return response.data;
};

export const updateGig = async (id: string, gigData: Partial<GigInput>): Promise<Gig> => {
    const response = await api.put<Gig>(`/gigs/${id}`, gigData);
    return response.data;
};

export const deleteGig = async (id: string): Promise<void> => {
    await api.delete(`/gigs/${id}`);
};

export const getCityById = async (id: string): Promise<City> => {
    try {
        const response = await api.get<City>(`/cities/${id}`);
        return response.data;
    } catch (error) {
        console.error('Failed to fetch city:', error);
        throw error;
    }
};

export interface SearchResult {
    id?: string;
    displayName: string;
    name: string;
    province: string;
    country: string;
    center: { lat: number; lng: number };
    osmId: number;
    osmType: string;
    type?: string;
    importance?: number;
    isPriority?: boolean;
    isLocal?: boolean;
    isManualSelection?: boolean;
    localizedChain?: LocalizedChain;
}

export interface SearchResponse {
    results: SearchResult[];
    source: 'local' | 'nominatim' | 'cache';
    hasMore: boolean;
}

export interface Notification {
    id: string;
    userId: string;
    type: string;
    title: string;
    content: string;
    isRead: boolean;
    isHard: boolean;
    linkLabel: string | null;
    linkUrl: string | null;
    metadata: Record<string, unknown>;
    aggregationKey: string | null;
    createdAt: string;
    readAt: string | null;
}

export interface NotificationRecipient {
    id: string;
    email: string;
    username: string | null;
}

export interface AdminNotificationInput {
    audience: 'all' | 'user';
    userId?: string;
    title: string;
    content: string;
    isHard: boolean;
}

export interface AdminPinnedNotification {
    id: string;
    title: string;
    content: string;
    type: string;
    recipientCount: number;
    createdAt: string;
}

export const getNotifications = async (): Promise<Notification[]> => {
    const response = await api.get<Notification[]>('/notifications');
    return response.data;
};

export const markNotificationsRead = async (ids: string[]): Promise<{ updated: number }> => {
    const response = await api.post<{ updated: number }>('/notifications/mark-read', { ids });
    return response.data;
};

export const deleteNotification = async (id: string): Promise<{ deleted: number }> => {
    const response = await api.delete<{ deleted: number }>(`/notifications/${id}`);
    return response.data;
};

export const clearNotifications = async (): Promise<{ deleted: number; keptHard: number }> => {
    const response = await api.delete<{ deleted: number; keptHard: number }>('/notifications');
    return response.data;
};

export const getAdminPinnedNotifications = async (): Promise<AdminPinnedNotification[]> => {
    const response = await api.get<AdminPinnedNotification[]>('/notifications/admin/pinned');
    return response.data;
};

export const deleteAdminPinnedNotification = async (id: string): Promise<{ deleted: number }> => {
    const response = await api.delete<{ deleted: number }>(`/notifications/admin/pinned/${id}`);
    return response.data;
};

export const searchNotificationRecipients = async (query: string): Promise<NotificationRecipient[]> => {
    const response = await api.get<NotificationRecipient[]>('/notifications/admin/recipients', {
        params: { q: query }
    });
    return response.data;
};

export const postAdminNotification = async (input: AdminNotificationInput): Promise<{ sent: number }> => {
    const response = await api.post<{ sent: number }>('/notifications/admin', input);
    return response.data;
};

export const updateProfile = async (updates: Partial<Pick<Profile, 'username' | 'isPrivate' | 'locationLanguage' | 'uiLanguage' | 'artistNameDisplayMode' | 'tutorialCompleted'>>): Promise<Profile> => {
    const response = await api.put<Profile>('/auth/profile', updates);
    return response.data;
};

export interface MusicBrainzCatalogArtist {
    mbid: string;
    name: string;
    nativeName?: string | null;
    romanizedName?: string | null;
    sortName?: string | null;
    type?: string | null;
    country?: string | null;
    areaName?: string | null;
    areaMbid?: string | null;
    beginAreaName?: string | null;
    beginAreaMbid?: string | null;
    lifeSpanBegin?: string | null;
    lifeSpanEnd?: string | null;
    ended?: boolean | null;
    disambiguation?: string | null;
    aliases?: MusicBrainzCatalogAlias[];
    aliasNames?: string[];
    aliasCount: number;
    genreCount: number;
    tagCount: number;
    relationCount: number;
    websiteUrl?: string | null;
    wikidataUrl?: string | null;
    instagramUrl?: string | null;
    twitterUrl?: string | null;
    tiktokUrl?: string | null;
    youtubeUrl?: string | null;
    spotifyUrl?: string | null;
    appleMusicUrl?: string | null;
    bandcampUrl?: string | null;
    soundcloudUrl?: string | null;
    seedSources?: string[];
    popularity?: unknown;
    globalRank?: number | null;
    regionalRanks?: unknown;
}

export interface MusicBrainzCatalogAlias {
    name: string;
    sortName?: string | null;
    locale?: string | null;
    type?: string | null;
    primary?: boolean | null;
    ended?: boolean | null;
    begin?: string | null;
    end?: string | null;
}

export interface MusicBrainzCatalogLink {
    url: string;
    host?: string | null;
    relationType: string;
    category: string;
    isPrimary: boolean;
}

export type MusicBrainzCatalogArtistDetail = MusicBrainzCatalogArtist & {
    links: MusicBrainzCatalogLink[];
};

export interface MusicBrainzCatalogSearchResponse {
    results: MusicBrainzCatalogArtist[];
    hasMore: boolean;
    offset: number;
    limit: number;
    count?: number;
}

export const searchMusicBrainzCatalogPage = async (
    params: { q: string; country?: string; type?: string; limit?: number; offset?: number },
    signal?: AbortSignal
): Promise<MusicBrainzCatalogSearchResponse> => {
    const response = await api.get<MusicBrainzCatalogSearchResponse>('/musicbrainz-catalog/search', {
        params,
        signal
    });
    return response.data;
};

export const searchMusicBrainzCatalog = async (
    params: { q: string; country?: string; type?: string; limit?: number; offset?: number },
    signal?: AbortSignal
): Promise<MusicBrainzCatalogArtist[]> => {
    const response = await searchMusicBrainzCatalogPage(params, signal);
    return response.results;
};

export const searchMusicBrainzCatalogOnline = async (
    params: { q: string; limit?: number; offset?: number },
    signal?: AbortSignal
): Promise<MusicBrainzCatalogSearchResponse> => {
    const response = await api.get<MusicBrainzCatalogSearchResponse>('/musicbrainz-catalog/search-online', {
        params,
        signal
    });
    return response.data;
};

export const getMusicBrainzCatalogArtist = async (mbid: string): Promise<MusicBrainzCatalogArtistDetail> => {
    const response = await api.get<MusicBrainzCatalogArtistDetail>(`/musicbrainz-catalog/${mbid}`);
    return response.data;
};

export const cacheMusicBrainzCatalogArtist = async (
    input: { mbid: string; query?: string } | { query: string }
): Promise<MusicBrainzCatalogArtist> => {
    const response = await api.post<MusicBrainzCatalogArtist>('/musicbrainz-catalog/cache', input);
    return response.data;
};

export const searchCities = async (
    query: string,
    limit: number = 20,
    source: 'local' | 'nominatim' | 'auto' = 'auto',
    signal?: AbortSignal,
    lang?: string
): Promise<SearchResponse> => {
    try {
        const response = await api.get<SearchResponse>('/cities/search', {
            params: { q: query, limit, source, ...(lang && lang !== 'native' ? { lang } : {}) },
            signal
        });
        return response.data;
    } catch (error) {
        if (axios.isCancel(error)) throw error;
        console.error('Failed to search cities:', error);
        throw error;
    }
};

// Search cities via Nominatim API
export const searchCitiesNominatim = async (query: string, limit: number = 20): Promise<SearchResponse> => {
    try {
        const response = await api.get<SearchResponse>('/cities/search/nominatim', {
            params: { q: query, limit }
        });
        return response.data;
    } catch (error) {
        console.error('Failed to search cities via Nominatim:', error);
        throw error;
    }
};

// Reverse geocode coordinates to city
export const reverseGeocode = async (lat: number, lng: number, withBoundary: boolean = true): Promise<SearchResult> => {
    try {
        const params = withBoundary ? '?withBoundary=true' : '';
        const response = await api.post<SearchResult>(`/cities/reverse${params}`, { lat, lng });
        return response.data;
    } catch (error) {
        console.error('Failed to reverse geocode:', error);
        throw error;
    }
};

// Reverse search - get all matching boundaries for coordinates
export const reverseSearchCities = async (
    lat: number,
    lng: number,
    limit: number = 10,
    source: 'auto' | 'nominatim' = 'auto',
    signal?: AbortSignal
): Promise<SearchResponse> => {
    try {
        const response = await api.post<SearchResponse>(
            `/cities/reverse/search?limit=${limit}&source=${source}`,
            { lat, lng },
            { signal }
        );
        return response.data;
    } catch (error) {
        if (axios.isCancel(error)) throw error;
        console.error('Failed to reverse search:', error);
        throw error;
    }
};

// Create a new artist
export const createArtist = async (artistData: Partial<Artist>): Promise<Artist> => {
    try {
        const response = await api.post<Artist>('/artists', artistData);
        return response.data;
    } catch (error) {
        console.error('Failed to create artist:', error);
        throw error;
    }
};

// Update an existing artist
export const updateArtist = async (id: string, artistData: Partial<Artist>): Promise<Artist> => {
    try {
        const response = await api.put<Artist>(`/artists/${id}`, artistData);
        return response.data;
    } catch (error) {
        console.error('Failed to update artist:', error);
        throw error;
    }
};

// Delete an artist
export const deleteArtist = async (id: string): Promise<void> => {
    try {
        await api.delete(`/artists/${id}`);
    } catch (error) {
        console.error('Failed to delete artist:', error);
        throw error;
    }
};

// Main search across current-map artists and global users
export const mainSearch = async (
    query: string,
    limit: number = 10,
    excludeUser?: string,
    signal?: AbortSignal,
    mapUsername?: string
): Promise<MainSearchResponse> => {
    try {
        const response = await api.get<MainSearchResponse>('/search', {
            params: { q: query, limit, excludeUser, mapUsername },
            signal
        });
        return response.data;
    } catch (error) {
        if (axios.isCancel(error)) throw error;
        console.error('Failed to search:', error);
        throw error;
    }
};

// Get localized names for a location (admin only)
export const getLocalizedNames = async (
    locationId: string
): Promise<{ id: string; chain: LocalizedChain }> => {
    const response = await api.get(`/cities/${locationId}/localized-names`);
    return response.data;
};

// Update localized names for a location (admin only, deep-merges)
export const updateLocalizedNames = async (
    locationId: string,
    localizedNames: Partial<LocalizedChain>
): Promise<{ message: string; id: string; localizedNames: LocalizedChain }> => {
    const response = await api.patch(`/cities/${locationId}/localized-names`, { localizedNames });
    return response.data;
};

// Reset localized names to auto-fetch (admin only)
export const resetLocalizedNames = async (
    locationId: string
): Promise<{ message: string; id: string; localizedNames: LocalizedChain }> => {
    const response = await api.patch(`/cities/${locationId}/localized-names`, { reset: true });
    return response.data;
};

export default api;
