import { ArtistStore } from '../models/artistStore';
import { CityService } from './cityService';
import { LocationLocalizationService } from './locationLocalizationService';
import { CreateArtistDTO, UpdateArtistDTO, Artist, StoreArtistDTO, UpdateStoreArtistDTO, ArtistQueryParams, Coordinates } from '../types/artist';
import { City } from '../types/city';
import pool from '../config/database';
import { MediaCleanupService } from './mediaCleanupService';

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

async function applySharedArtistMedia(
    data: CreateArtistDTO | UpdateArtistDTO,
    userId: string,
    isAdmin: boolean
) {
    if (!data.musicbrainzMbid || !data.sourceImage) return;

    const uploadResult = await pool.query<{
        public_id: string;
        bytes: number | null;
        width: number | null;
        height: number | null;
        format: string | null;
    }>(`
        SELECT public_id, bytes, width, height, format
        FROM media_upload_events
        WHERE user_id = $1
          AND secure_url = $2
          AND status = 'uploaded'
        ORDER BY completed_at DESC NULLS LAST, created_at DESC
        LIMIT 1
    `, [userId, data.sourceImage]);

    const upload = uploadResult.rows[0];

    if (!upload) {
        delete data.sourceImage;
        delete data.avatarCrop;
        delete data.profileCrop;
        return;
    }

    if (!isAdmin) {
        return;
    }

    const existingResult = await pool.query<{
        id: string;
        public_id: string | null;
        uploaded_by: string | null;
        original_uploaded_by: string | null;
    }>(`
        SELECT id, public_id, uploaded_by, original_uploaded_by
        FROM artist_media_assets
        WHERE musicbrainz_mbid = $1
    `, [data.musicbrainzMbid]);

    const existingAsset = existingResult.rows[0];
    const hasSharedAsset = Boolean(existingAsset);
    const isOriginalUploader = (existingAsset?.original_uploaded_by || existingAsset?.uploaded_by) === userId;

    if (hasSharedAsset && !isAdmin && !isOriginalUploader) {
        await pool.query(`
            WITH updated AS (
                UPDATE artist_media_asset_reviews
                SET
                    source_image = $2,
                    avatar_crop = $3,
                    profile_crop = $4,
                    public_id = $5,
                    bytes = $6,
                    width = $7,
                    height = $8,
                    format = $9,
                    created_at = NOW()
                WHERE musicbrainz_mbid = $1
                  AND submitted_by = $10
                  AND status = 'pending'
                RETURNING id
            )
            INSERT INTO artist_media_asset_reviews (
                musicbrainz_mbid, source_image, avatar_crop, profile_crop,
                public_id, bytes, width, height, format, submitted_by
            )
            SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
            WHERE NOT EXISTS (SELECT 1 FROM updated)
        `, [
            data.musicbrainzMbid,
            data.sourceImage,
            data.avatarCrop ? JSON.stringify(data.avatarCrop) : null,
            data.profileCrop ? JSON.stringify(data.profileCrop) : null,
            upload.public_id,
            upload.bytes,
            upload.width,
            upload.height,
            upload.format,
            userId
        ]);

        delete data.sourceImage;
        delete data.avatarCrop;
        delete data.profileCrop;
        return;
    }

    const previousSharedPublicId = existingAsset?.public_id || null;
    const nextPublicId = upload?.public_id || null;

    await pool.query(`
        INSERT INTO artist_media_assets (
            musicbrainz_mbid, source_image, avatar_crop, profile_crop,
            public_id, bytes, width, height, format, original_uploaded_by, uploaded_by, updated_by
        ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8, $9, $10, $10, $10
        )
        ON CONFLICT (musicbrainz_mbid) DO UPDATE
        SET
            source_image = EXCLUDED.source_image,
            avatar_crop = EXCLUDED.avatar_crop,
            profile_crop = EXCLUDED.profile_crop,
            public_id = EXCLUDED.public_id,
            bytes = EXCLUDED.bytes,
            width = EXCLUDED.width,
            height = EXCLUDED.height,
            format = EXCLUDED.format,
            original_uploaded_by = COALESCE(artist_media_assets.original_uploaded_by, artist_media_assets.uploaded_by, EXCLUDED.original_uploaded_by),
            uploaded_by = EXCLUDED.uploaded_by,
            updated_by = EXCLUDED.updated_by
    `, [
        data.musicbrainzMbid,
        data.sourceImage,
        data.avatarCrop ? JSON.stringify(data.avatarCrop) : null,
        data.profileCrop ? JSON.stringify(data.profileCrop) : null,
        upload?.public_id || null,
        upload?.bytes || null,
        upload?.width || null,
        upload?.height || null,
        upload?.format || null,
        userId
    ]);

    if (previousSharedPublicId && previousSharedPublicId !== nextPublicId) {
        await MediaCleanupService.deletePublicIdIfUnused(previousSharedPublicId);
    }

    delete data.sourceImage;
    delete data.avatarCrop;
    delete data.profileCrop;
}

export const ArtistService = {
    getAll: async (params: ArtistQueryParams) => {
        return await ArtistStore.getAll(params);
    },

    getById: async (id: string) => {
        return await ArtistStore.getById(id);
    },

    create: async (data: CreateArtistDTO, userId: string, isAdmin: boolean = false): Promise<Artist> => {
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
        await applySharedArtistMedia(data, userId, isAdmin);

        const storeData: StoreArtistDTO = {
            ...data,
            userId,
            originalCityId: originalCity.id,
            activeCityId: activeCity.id,
            originalLocationDisplayCoordinates: originalDisplayCoordinates,
            activeLocationDisplayCoordinates: activeDisplayCoordinates
        };

        const createdArtist = await ArtistStore.create(storeData);
        return await ArtistStore.getById(createdArtist.id) || createdArtist;
    },

    update: async (id: string, data: UpdateArtistDTO, userId: string, isAdmin: boolean = false): Promise<Artist | undefined> => {
        const storeData: UpdateStoreArtistDTO = { ...data };

        // Fetch current artist to check city IDs
        const currentArtist = await ArtistStore.getById(id);
        if (!currentArtist) {
            return undefined;
        }

        const currentPrivateMediaResult = await pool.query<{ source_image: string | null }>(`
            SELECT source_image
            FROM artists
            WHERE id = $1
        `, [id]);
        const previousPrivateSourceImage = currentPrivateMediaResult.rows[0]?.source_image || null;

        storeData.musicbrainzMbid = data.musicbrainzMbid ?? currentArtist.musicbrainzMbid;
        await applySharedArtistMedia(storeData, userId, isAdmin);

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

        const updatedArtist = await ArtistStore.update(id, storeData);
        if (
            updatedArtist &&
            previousPrivateSourceImage &&
            storeData.sourceImage !== undefined &&
            storeData.sourceImage !== previousPrivateSourceImage
        ) {
            await MediaCleanupService.deleteOwnedUploadByUrlIfUnused(userId, previousPrivateSourceImage);
        }

        return updatedArtist ? await ArtistStore.getById(updatedArtist.id) || updatedArtist : undefined;
    },

    delete: async (id: string, userId: string) => {
        const mediaResult = await pool.query<{ source_image: string | null }>(`
            SELECT source_image
            FROM artists
            WHERE id = $1
        `, [id]);

        const sourceImage = mediaResult.rows[0]?.source_image;
        const deleted = await ArtistStore.delete(id);

        if (deleted && sourceImage) {
            await MediaCleanupService.deleteOwnedUploadByUrlIfUnused(userId, sourceImage);
        }

        return deleted;
    },

    countByCity: async (view: 'original' | 'active' = 'active', userId?: string) => {
        return await ArtistStore.countByCity(view, userId);
    }
};
