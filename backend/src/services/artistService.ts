import { ArtistStore } from '../models/artistStore';
import { CityService } from './cityService';
import { LocationLocalizationService } from './locationLocalizationService';
import { CreateArtistDTO, UpdateArtistDTO, Artist, StoreArtistDTO, UpdateStoreArtistDTO, ArtistQueryParams, Coordinates } from '../types/artist';
import { City } from '../types/city';

// ~1km tolerance to account for Nominatim coordinate variations
const COORD_TOLERANCE = 0.01;

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

async function resolveCity(osmId: number, osmType: string): Promise<City> {
    let city = await CityService.getByOsmId(osmId, osmType);
    if (!city) {
        const nominatimData = await CityService.fetchByOsmId(osmId, osmType);
        if (!nominatimData) {
            throw new Error('Failed to fetch city data from Nominatim');
        }
        city = await CityService.saveFromNominatim(nominatimData);
    }

    // Fire-and-forget: don't block save on localization. Idempotent so safe to retry.
    void LocationLocalizationService.ensureLocalized(city.id).catch((err) => {
        console.error(`[artistService] background localization for ${city.id} crashed:`, err);
    });

    return city;
}

export const ArtistService = {
    getAll: async (params: ArtistQueryParams) => {
        return await ArtistStore.getAll(params);
    },

    getById: async (id: string) => {
        return await ArtistStore.getById(id);
    },

    create: async (data: CreateArtistDTO, userId: string): Promise<Artist> => {
        // 1. Resolve cities
        if (!data.originalLocation.osmId || !data.originalLocation.osmType) {
            throw new Error('Original location must include osmId and osmType');
        }
        if (!data.activeLocation.osmId || !data.activeLocation.osmType) {
            throw new Error('Active location must include osmId and osmType');
        }

        const originalCity = await resolveCity(data.originalLocation.osmId, data.originalLocation.osmType);
        const activeCity = await resolveCity(data.activeLocation.osmId, data.activeLocation.osmType);

        // 2. Determine coordinate selection method
        const originalManual = shouldUseManualCoordinates(data.originalLocation, originalCity.center);
        const activeManual = shouldUseManualCoordinates(data.activeLocation, activeCity.center);
        const isCopiedFromOriginal = data.originalLocation.coordinates && data.activeLocation.coordinates &&
            coordsMatch(data.originalLocation.coordinates, data.activeLocation.coordinates);

        // 3. Set coordinates and display coordinates based on selection method
        let originalDisplayCoordinates, activeDisplayCoordinates;

        if (originalManual) {
            originalDisplayCoordinates = data.originalLocation.coordinates;
        } else {
            data.originalLocation.coordinates = originalCity.center;
            const randomPoint = await CityService.generateRandomPoint(originalCity.id);
            originalDisplayCoordinates = randomPoint || originalCity.center;
        }

        if (isCopiedFromOriginal) {
            data.activeLocation.coordinates = data.originalLocation.coordinates;
            activeDisplayCoordinates = originalDisplayCoordinates;
        } else if (activeManual) {
            activeDisplayCoordinates = data.activeLocation.coordinates;
        } else {
            data.activeLocation.coordinates = activeCity.center;
            const randomPoint = await CityService.generateRandomPoint(activeCity.id);
            activeDisplayCoordinates = randomPoint || activeCity.center;
        }

        // 4. Prepare data for Store
        const storeData: StoreArtistDTO = {
            ...data,
            userId,
            originalCityId: originalCity.id,
            activeCityId: activeCity.id,
            originalLocationDisplayCoordinates: originalDisplayCoordinates,
            activeLocationDisplayCoordinates: activeDisplayCoordinates
        };

        return await ArtistStore.create(storeData);
    },

    update: async (id: string, data: UpdateArtistDTO): Promise<Artist | undefined> => {
        const storeData: UpdateStoreArtistDTO = { ...data };

        // Fetch current artist to check city IDs
        const currentArtist = await ArtistStore.getById(id);
        if (!currentArtist) {
            return undefined;
        }

        let finalOriginalCityId = currentArtist.originalCityId;
        let finalActiveCityId = currentArtist.activeCityId;

        // If locations are being updated, resolve new IDs
        let originalCity: City | undefined, activeCity: City | undefined;

        // Check if original location actually changed
        const originalLocationChanged = data.originalLocation && (
            data.originalLocation.osmId && data.originalLocation.osmType
        );

        // Check if active location actually changed
        const activeLocationChanged = data.activeLocation && (
            data.activeLocation.osmId && data.activeLocation.osmType
        );

        if (originalLocationChanged) {
            originalCity = await resolveCity(data.originalLocation!.osmId!, data.originalLocation!.osmType!);
            storeData.originalCityId = originalCity.id;
            finalOriginalCityId = originalCity.id;
        } else {
            // Location not changed, remove from update data
            delete storeData.originalLocation;
        }

        if (activeLocationChanged) {
            activeCity = await resolveCity(data.activeLocation!.osmId!, data.activeLocation!.osmType!);
            storeData.activeCityId = activeCity.id;
            finalActiveCityId = activeCity.id;
        } else {
            // Location not changed, remove from update data
            delete storeData.activeLocation;
        }

        const originalManual = Boolean(originalLocationChanged && originalCity &&
            shouldUseManualCoordinates(data.originalLocation!, originalCity.center));

        const activeManual = Boolean(activeLocationChanged && activeCity &&
            shouldUseManualCoordinates(data.activeLocation!, activeCity.center));

        const isCopiedFromOriginal = originalLocationChanged && activeLocationChanged &&
            data.originalLocation?.coordinates && data.activeLocation?.coordinates &&
            coordsMatch(data.originalLocation.coordinates, data.activeLocation.coordinates);

        if (originalLocationChanged) {
            if (originalManual) {
                storeData.originalLocationDisplayCoordinates = data.originalLocation!.coordinates;
            } else {
                data.originalLocation!.coordinates = originalCity!.center;
                const randomPoint = await CityService.generateRandomPoint(finalOriginalCityId);
                storeData.originalLocationDisplayCoordinates = randomPoint || originalCity!.center;
            }
        }

        if (activeLocationChanged) {
            if (isCopiedFromOriginal && storeData.originalLocationDisplayCoordinates) {
                data.activeLocation!.coordinates = data.originalLocation!.coordinates;
                storeData.activeLocationDisplayCoordinates = storeData.originalLocationDisplayCoordinates;
            } else if (activeManual) {
                storeData.activeLocationDisplayCoordinates = data.activeLocation!.coordinates;
            } else {
                data.activeLocation!.coordinates = activeCity!.center;
                const randomPoint = await CityService.generateRandomPoint(finalActiveCityId);
                storeData.activeLocationDisplayCoordinates = randomPoint || activeCity!.center;
            }
        }

        return await ArtistStore.update(id, storeData);
    },

    delete: async (id: string) => {
        return await ArtistStore.delete(id);
    },

    countByCity: async (view: 'original' | 'active' = 'active', userId?: string) => {
        return await ArtistStore.countByCity(view, userId);
    }
};
