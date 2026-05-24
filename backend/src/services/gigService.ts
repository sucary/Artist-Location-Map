import pool from '../config/database';
import { CityService } from './cityService';
import { LocationLocalizationService } from './locationLocalizationService';
import { GigStore } from '../models/gigStore';
import type { Coordinates, Location } from '../types/artist';
import type { City } from '../types/city';
import type {
    CreateGigDTO,
    CreateTourDTO,
    Gig,
    GigQueryParams,
    StoreGigDTO,
    Tour,
    UpdateGigDTO,
    UpdateStoreGigDTO,
    UpdateTourDTO,
} from '../types/gig';

// Gig and tour ownership, location resolution, and default date-window rules

const COORD_TOLERANCE = 0.01;
const MIN_PLACEMENT_BOUNDARY_AREA_M2 = 1000000;

function coordsMatch(a: Coordinates, b: Coordinates): boolean {
    return Math.abs(a.lat - b.lat) < COORD_TOLERANCE &&
           Math.abs(a.lng - b.lng) < COORD_TOLERANCE;
}

function isManualSelection(coords: Coordinates, cityCenter: Coordinates): boolean {
    return !coordsMatch(coords, cityCenter);
}

function shouldUseManualCoordinates(
    location: { coordinates?: Coordinates; isManualSelection?: boolean; osmType?: string },
    cityCenter: Coordinates
): boolean {
    if (!location.coordinates) return false;
    if (location.isManualSelection) return true;
    return location.osmType !== 'node' && isManualSelection(location.coordinates, cityCenter);
}

function toIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number): Date {
    const next = new Date(date);
    next.setUTCMonth(next.getUTCMonth() + months);
    return next;
}

async function hasUsablePlacementBoundary(cityId: string): Promise<boolean> {
    const result = await pool.query<{ usable: boolean }>(`
        SELECT (
            COALESCE(boundary, raw_boundary) IS NOT NULL
            AND NOT ST_IsEmpty(COALESCE(boundary, raw_boundary)::geometry)
            AND ST_Area(COALESCE(boundary, raw_boundary)) >= $2
        ) AS usable
        FROM locations
        WHERE id = $1
    `, [cityId, MIN_PLACEMENT_BOUNDARY_AREA_M2]);

    return result.rows[0]?.usable === true;
}

async function resolveCity(osmId: number, osmType: string): Promise<City> {
    let city = await CityService.getByOsmId(osmId, osmType);

    if (!city || !await hasUsablePlacementBoundary(city.id)) {
        const nominatimData = await CityService.fetchByOsmId(osmId, osmType);
        if (!nominatimData) {
            throw new Error('Failed to fetch city data from Nominatim');
        }
        city = await CityService.saveFromNominatim(nominatimData);
    }

    // Background localization keeps gig locations consistent with artist locations
    void LocationLocalizationService.ensureLocalized(city.id).catch((err) => {
        console.error(`[gigService] background localization for ${city.id} crashed:`, err);
    });

    return city;
}

async function getOwnedArtistIds(artistIds: string[], userId: string, isAdmin: boolean): Promise<string[]> {
    const uniqueIds = Array.from(new Set(artistIds));
    if (uniqueIds.length === 0) return [];

    const result = await pool.query<{ id: string; user_id: string | null }>(`
        SELECT id, user_id
        FROM artists
        WHERE id = ANY($1::uuid[])
    `, [uniqueIds]);

    if (result.rows.length !== uniqueIds.length) {
        throw new Error('Artist not found');
    }
    if (!isAdmin && result.rows.some((artist) => artist.user_id !== userId)) {
        throw new Error('Artist not found');
    }

    return uniqueIds;
}

async function getOwnerIdForArtists(artistIds: string[], userId: string, isAdmin: boolean): Promise<string> {
    await getOwnedArtistIds(artistIds, userId, isAdmin);
    if (!isAdmin) return userId;

    const result = await pool.query<{ user_id: string | null }>(`
        SELECT DISTINCT user_id
        FROM artists
        WHERE id = ANY($1::uuid[])
    `, [artistIds]);
    const ownerIds = result.rows.map((row) => row.user_id).filter((id): id is string => !!id);
    if (ownerIds.length !== 1) {
        throw new Error('Artists must belong to the same owner');
    }

    return ownerIds[0];
}

async function assertTourForOwner(tourId: string | undefined | null, userId: string): Promise<void> {
    if (!tourId) return;
    const tour = await GigStore.getTourById(tourId);
    if (!tour || tour.userId !== userId) {
        throw new Error('Tour not found');
    }
}

async function resolveGigLocation(
    location: Location,
    userId: string
): Promise<{ location: Location; locationCityId: string; displayCoordinates: Coordinates }> {
    if (!location.osmId || !location.osmType) {
        throw new Error('Gig location must include osmId and osmType');
    }

    const city = await resolveCity(location.osmId, location.osmType);
    const manual = shouldUseManualCoordinates(location, city.center);
    const resolvedLocation: Location = {
        ...location,
        city: city.name,
        province: city.province,
        country: city.country ?? undefined,
        displayName: city.displayName || location.displayName,
        coordinates: manual ? location.coordinates : city.center,
    };

    if (manual) {
        return {
            location: resolvedLocation,
            locationCityId: city.id,
            displayCoordinates: location.coordinates,
        };
    }

    const randomPoint = await CityService.generateRandomPoint(city.id, undefined, userId);
    return {
        location: resolvedLocation,
        locationCityId: city.id,
        displayCoordinates: randomPoint || city.center,
    };
}

function withDefaultDateWindow(params: Omit<GigQueryParams, 'userId'>): Omit<GigQueryParams, 'userId'> {
    if (params.from || params.to) return params;

    const today = new Date();
    const from = toIsoDate(today);
    const to = toIsoDate(addMonths(today, 12));

    return { ...params, from, to };
}

export const GigService = {
    getAll: async (params: GigQueryParams): Promise<Gig[]> => {
        return await GigStore.getAll({ ...params, ...withDefaultDateWindow(params) });
    },

    getByArtist: async (artistId: string, userId: string, isAdmin: boolean): Promise<Gig[]> => {
        await getOwnedArtistIds([artistId], userId, isAdmin);
        return await GigStore.getAll({ userId, artistId });
    },

    getByIdForUser: async (id: string, userId: string, isAdmin: boolean): Promise<Gig | undefined> => {
        const gig = await GigStore.getById(id);
        if (!gig) return undefined;
        if (!isAdmin && gig.userId !== userId) return undefined;
        return gig;
    },

    create: async (data: CreateGigDTO, userId: string, isAdmin: boolean = false): Promise<Gig> => {
        const ownerId = await getOwnerIdForArtists(data.artistIds, userId, isAdmin);
        await assertTourForOwner(data.tourId, ownerId);
        const resolved = await resolveGigLocation(data.location, ownerId);
        const storeData: StoreGigDTO = {
            ...data,
            userId: ownerId,
            location: resolved.location,
            locationCityId: resolved.locationCityId,
            displayCoordinates: resolved.displayCoordinates,
        };

        return await GigStore.create(storeData);
    },

    update: async (id: string, data: UpdateGigDTO, userId: string, isAdmin: boolean = false): Promise<Gig | undefined> => {
        const current = await GigService.getByIdForUser(id, userId, isAdmin);
        if (!current) return undefined;

        const ownerId = data.artistIds
            ? await getOwnerIdForArtists(data.artistIds, userId, isAdmin)
            : current.userId;
        await assertTourForOwner(data.tourId, ownerId);

        const storeData: UpdateStoreGigDTO = { ...data, userId: ownerId };
        if (data.location) {
            const resolved = await resolveGigLocation(data.location, ownerId);
            storeData.location = resolved.location;
            storeData.locationCityId = resolved.locationCityId;
            storeData.displayCoordinates = resolved.displayCoordinates;
        }

        return await GigStore.update(id, storeData);
    },

    delete: async (id: string, userId: string, isAdmin: boolean = false): Promise<boolean> => {
        const gig = await GigService.getByIdForUser(id, userId, isAdmin);
        if (!gig) return false;
        return await GigStore.delete(id);
    },

    getTours: async (userId: string): Promise<Tour[]> => {
        return await GigStore.getTours(userId);
    },

    createTour: async (data: CreateTourDTO, userId: string, isAdmin: boolean = false): Promise<Tour> => {
        if (data.artistIds?.length) {
            await getOwnedArtistIds(data.artistIds, userId, isAdmin);
        }
        return await GigStore.createTour(data, userId);
    },

    updateTour: async (id: string, data: UpdateTourDTO, userId: string, isAdmin: boolean = false): Promise<Tour | undefined> => {
        const current = await GigStore.getTourById(id);
        if (!current || (!isAdmin && current.userId !== userId)) return undefined;
        if (data.artistIds?.length) {
            await getOwnedArtistIds(data.artistIds, current.userId, isAdmin);
        }
        return await GigStore.updateTour(id, data, current.userId);
    },

    deleteTour: async (id: string, userId: string, isAdmin: boolean = false): Promise<boolean> => {
        const current = await GigStore.getTourById(id);
        if (!current || (!isAdmin && current.userId !== userId)) return false;
        return await GigStore.deleteTour(id, current.userId);
    },
};
