import pool from '../config/database';
import { CityService } from './cityService';
import { LocationLocalizationService } from './locationLocalizationService';
import { GigStore } from '../models/gigStore';
import { PlaceLocationStore } from '../models/placeLocationStore';
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

// Provider-backed tour points do not require our locations table
function isExternalTourLocation(location: Location): boolean {
    return location.source === 'geoapify' ||
           location.source === 'local' ||
           location.source === 'manual' ||
           location.source === 'venue';
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

async function resolveContainingLocalCity(coords: Coordinates): Promise<City | null> {
    const results = await CityService.reverseGeocodeAll(coords.lat, coords.lng, 1);
    return results[0] ?? null;
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

// Provider place references must fail before FK errors
async function assertPlaceLocationExists(placeLocationId: string | undefined | null): Promise<void> {
    if (!placeLocationId) return;
    const place = await PlaceLocationStore.getById(placeLocationId);
    if (!place) {
        throw new Error('Place location not found');
    }
}

// Tour membership accepts only existing owner gigs
async function assertGigsForOwner(gigIds: string[] | undefined, userId: string): Promise<void> {
    if (!gigIds?.length) return;

    const uniqueIds = Array.from(new Set(gigIds));
    const ownedIds = await GigStore.getOwnedGigIds(uniqueIds, userId);
    if (ownedIds.length !== uniqueIds.length) {
        throw new Error('Gig not found');
    }
}

async function resolveGigLocation(
    location: Location,
    userId: string
): Promise<{ location: Location; locationCityId: string | null; displayCoordinates: Coordinates }> {
    if (location.cityId && (!location.osmId || !location.osmType)) {
        const city = await CityService.getById(location.cityId);
        if (!city) {
            throw new Error('Gig location cityId was not found');
        }

        // Tour provider locations already carry their exact marker point
        return {
            location: {
                ...location,
                city: location.city || city.name,
                province: location.province || city.province,
                country: location.country || city.country || undefined,
                displayName: location.displayName || city.displayName,
                coordinates: location.coordinates,
            },
            locationCityId: city.id,
            displayCoordinates: location.coordinates,
        };
    }

    if (!location.osmId || !location.osmType) {
        if (isExternalTourLocation(location)) {
            const localCity = await resolveContainingLocalCity(location.coordinates);
            if (localCity) {
                return {
                    location: {
                        ...location,
                        city: location.city || localCity.name,
                        province: location.province || localCity.province,
                        country: location.country || localCity.country || undefined,
                    },
                    locationCityId: localCity.id,
                    displayCoordinates: location.coordinates,
                };
            }

            // Geoapify venue coordinates are valid even without a local city row
            return {
                location,
                locationCityId: null,
                displayCoordinates: location.coordinates,
            };
        }

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

function hasTourAssignment(data: Pick<CreateGigDTO, 'tourId' | 'newTourName'>): boolean {
    return Boolean(data.tourId || data.newTourName);
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
        await assertPlaceLocationExists(data.placeLocationId);
        const resolved = await resolveGigLocation(data.location, ownerId);
        const storeData: StoreGigDTO = {
            ...data,
            // Tour title replaces per-gig title in normal gig display
            gigName: hasTourAssignment(data) ? null : data.gigName,
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
        await assertPlaceLocationExists(data.placeLocationId);

        const storeData: UpdateStoreGigDTO = { ...data, userId: ownerId };
        const nextHasTourAssignment = Boolean(data.newTourName) || (data.tourId === null
            ? false
            : Boolean(data.tourId || current.tourId));
        if (nextHasTourAssignment) {
            // Tour title replaces per-gig title in normal gig display
            storeData.gigName = null;
        }
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
        await assertGigsForOwner(data.gigIds, userId);
        return await GigStore.createTour(data, userId);
    },

    updateTour: async (id: string, data: UpdateTourDTO, userId: string, isAdmin: boolean = false): Promise<Tour | undefined> => {
        const current = await GigStore.getTourById(id);
        if (!current || (!isAdmin && current.userId !== userId)) return undefined;
        if (data.artistIds?.length) {
            await getOwnedArtistIds(data.artistIds, current.userId, isAdmin);
        }
        await assertGigsForOwner(data.gigIds, current.userId);
        return await GigStore.updateTour(id, data, current.userId);
    },

    deleteTour: async (id: string, userId: string, isAdmin: boolean = false): Promise<boolean> => {
        const current = await GigStore.getTourById(id);
        if (!current || (!isAdmin && current.userId !== userId)) return false;
        return await GigStore.deleteTour(id, current.userId);
    },
};
