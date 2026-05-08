import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createArtist, updateArtist } from '../services/api';
import type { MusicBrainzCatalogArtist, SearchResult } from '../services/api';
import type { Artist, CropArea } from '../types/artist';
import type { SocialLinkKey } from '../constants/artist';
import { extractLocationData, createEmptyLocation, hasValidCoordinates } from '../utils/locationUtils';
import { getArtistMediaAssetStatus, uploadImageToCloudinary } from '../utils/cloudinary';
import { validateAllSocialLinks } from '../utils/urlValidation';
import { useTranslation } from 'react-i18next';

export interface UseArtistFormOptions {
    initialData?: Artist;
    onSuccess?: (artist: Artist) => void;
    onCancel?: () => void;
}

export interface UseArtistFormReturn {
    formData: Partial<Artist>;
    setFormData: React.Dispatch<React.SetStateAction<Partial<Artist>>>;

    isSaving: boolean;
    error: string | null;
    musicBrainzLocationStatus: string | null;
    musicBrainzLocationSearches: {
        originalLocation: { query: string; key: number } | null;
        activeLocation: { query: string; key: number } | null;
    };
    locationInputSyncKeys: {
        originalLocation: number;
        activeLocation: number;
    };
    pendingField: 'originalLocation' | 'activeLocation' | null;

    handleLocationSelect: (result: SearchResult, locationType: 'originalLocation' | 'activeLocation') => void;
    handleSave: () => Promise<void>;
    copyOriginalToActive: () => void;
    startManualPinSelection: (field: 'originalLocation' | 'activeLocation') => void;
    clearPendingField: () => void;
    clearError: () => void;
    updateSocialLink: (key: SocialLinkKey, value: string) => void;
    updateName: (name: string) => void;
    applyMusicBrainzArtist: (
        artist: MusicBrainzCatalogArtist,
        options?: { useSharedImage?: boolean }
    ) => Promise<void>;
    updateDebutYear: (year: number | undefined) => void;
    updateInactiveYear: (year: number | undefined) => void;

    // Image handling
    isUploadingImage: boolean;
    uploadError: string | null;
    clearUploadError: () => void;
    handleImageUpload: (file: File) => Promise<string | null>;
    clearImage: () => void;
    updateCrops: (avatarCrop: CropArea, profileCrop: CropArea) => void;

    isEditing: boolean;
}

const createInitialFormData = (initialData: Artist | undefined): Partial<Artist> => {
    if (initialData) return initialData;

    return {
        name: '',
        sourceImage: '',
        avatarCrop: undefined,
        profileCrop: undefined,
        originalLocation: createEmptyLocation(),
        activeLocation: createEmptyLocation(),
        socialLinks: {}
    };
};

export const useArtistForm = ({
    initialData,
    onSuccess,
    onCancel
}: UseArtistFormOptions): UseArtistFormReturn => {
    const queryClient = useQueryClient();
    const { t } = useTranslation();

    const [formData, setFormData] = useState<Partial<Artist>>(() => createInitialFormData(initialData));
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [musicBrainzLocationStatus, setMusicBrainzLocationStatus] = useState<string | null>(null);
    const [musicBrainzLocationSearches, setMusicBrainzLocationSearches] = useState<{
        originalLocation: { query: string; key: number } | null;
        activeLocation: { query: string; key: number } | null;
    }>({
        originalLocation: null,
        activeLocation: null
    });
    const [, setQueuedMusicBrainzActiveLocationSearch] = useState<string | null>(null);
    const [locationInputSyncKeys, setLocationInputSyncKeys] = useState({
        originalLocation: 0,
        activeLocation: 0
    });
    const [pendingField, setPendingField] = useState<'originalLocation' | 'activeLocation' | null>(null);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const isEditing = Boolean(initialData?.id);

    const clearError = useCallback(() => setError(null), []);
    const clearPendingField = useCallback(() => setPendingField(null), []);
    const clearUploadError = useCallback(() => setUploadError(null), []);

    const handleLocationSelect = useCallback((
        result: SearchResult,
        locationType: 'originalLocation' | 'activeLocation'
    ) => {
        const locationData = extractLocationData(result);
        setFormData(prev => ({
            ...prev,
            [locationType]: locationData
        }));
        setLocationInputSyncKeys(prev => ({
            ...prev,
            [locationType]: prev[locationType] + 1
        }));
        setError(null);
        setMusicBrainzLocationSearches(prev => ({
            ...prev,
            [locationType]: null
        }));
        if (locationType === 'originalLocation') {
            setQueuedMusicBrainzActiveLocationSearch((query) => {
                if (!query) return null;
                setMusicBrainzLocationSearches(prev => ({
                    ...prev,
                    activeLocation: { query, key: Date.now() }
                }));
                return null;
            });
        }
    }, []);

    const copyOriginalToActive = useCallback(() => {
        setFormData(prev => ({
            ...prev,
            activeLocation: prev.originalLocation ? { ...prev.originalLocation } : prev.activeLocation,
            activeLocationDisplayCoordinates: prev.originalLocationDisplayCoordinates
                ? { ...prev.originalLocationDisplayCoordinates }
                : prev.originalLocation?.coordinates
                    ? { ...prev.originalLocation.coordinates }
                    : prev.activeLocationDisplayCoordinates,
            activeCityId: prev.originalCityId || prev.activeCityId
        }));
        setMusicBrainzLocationSearches(prev => ({
            ...prev,
            activeLocation: null
        }));
        setLocationInputSyncKeys(prev => ({
            ...prev,
            activeLocation: prev.activeLocation + 1
        }));
        setPendingField(null);
    }, []);

    const startManualPinSelection = useCallback((field: 'originalLocation' | 'activeLocation') => {
        setPendingField(field);
    }, []);

    const updateSocialLink = useCallback((key: SocialLinkKey, value: string) => {
        setFormData(prev => ({
            ...prev,
            socialLinks: { ...prev.socialLinks, [key]: value }
        }));
    }, []);

    const updateName = useCallback((name: string) => {
        setFormData(prev => ({ ...prev, name }));
    }, []);

    const parseYear = useCallback((value?: string | null) => {
        if (!value) return undefined;
        const year = Number(value.slice(0, 4));
        return Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : undefined;
    }, []);

    const getLinkHost = useCallback((url?: string | null) => {
        if (!url) return '';
        try {
            return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
        } catch {
            return '';
        }
    }, []);

    const findMusicBrainzLink = useCallback((
        artist: MusicBrainzCatalogArtist,
        hosts: string[],
        fallback?: string | null
    ) => {
        const links = 'links' in artist && Array.isArray(artist.links) ? artist.links : [];
        const match = links.find((link) => {
            const host = getLinkHost(link.url);
            return hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
        });

        return match?.url || fallback || '';
    }, [getLinkHost]);

    const getMusicBrainzSocialLinks = useCallback((artist: MusicBrainzCatalogArtist) => {
        return {
            website: findMusicBrainzLink(artist, [], artist.websiteUrl),
            instagram: findMusicBrainzLink(artist, ['instagram.com'], artist.instagramUrl),
            twitter: findMusicBrainzLink(artist, ['x.com', 'twitter.com'], artist.twitterUrl),
            appleMusic: findMusicBrainzLink(artist, ['music.apple.com', 'itunes.apple.com'], artist.appleMusicUrl),
            youtube: findMusicBrainzLink(artist, ['youtube.com', 'youtu.be'], artist.youtubeUrl),
        };
    }, [findMusicBrainzLink]);

    const hasSocialLinks = useCallback((links: ReturnType<typeof getMusicBrainzSocialLinks>) => (
        Object.values(links).some(Boolean)
    ), []);

    const buildLocationQuery = useCallback((primary?: string | null, context?: string | null) => {
        const first = primary?.trim();
        const second = context?.trim();
        if (!first) return '';
        if (!second || first.toLowerCase() === second.toLowerCase()) return first;
        return `${first}, ${second}`;
    }, []);

    const applyMusicBrainzArtist = useCallback(async (
        artist: MusicBrainzCatalogArtist,
        options?: { useSharedImage?: boolean }
    ) => {
        const originalLocationQuery = buildLocationQuery(
            artist.beginAreaName || artist.areaName,
            artist.beginAreaName ? artist.areaName : artist.country
        );
        const activeLocationQuery = buildLocationQuery(
            artist.areaName || artist.beginAreaName,
            artist.country
        );
        const debutYear = parseYear(artist.lifeSpanBegin);
        const inactiveYear = artist.ended ? parseYear(artist.lifeSpanEnd) : undefined;
        const socialLinks = getMusicBrainzSocialLinks(artist);

        const hasPreMusicBrainzUpload = Boolean(
            formData.sourceImage &&
            !formData.musicbrainzMbid &&
            !options?.useSharedImage
        );
        const mediaStatus = await getArtistMediaAssetStatus(artist.mbid).catch(() => null);
        const hasAutofilledInfo = Boolean(
            debutYear ||
            inactiveYear ||
            hasSocialLinks(socialLinks) ||
            (!hasPreMusicBrainzUpload && mediaStatus?.sourceImage)
        );

        setFormData(prev => ({
            ...prev,
            musicbrainzMbid: artist.mbid,
            name: artist.name,
            romanizedName: artist.sortName && artist.sortName !== artist.name ? artist.sortName : undefined,
            debutYear,
            inactiveYear,
            socialLinks,
            sourceImage: !hasPreMusicBrainzUpload && mediaStatus?.sourceImage
                ? mediaStatus.sourceImage
                : prev.sourceImage,
            avatarCrop: !hasPreMusicBrainzUpload && mediaStatus?.avatarCrop
                ? mediaStatus.avatarCrop
                : prev.avatarCrop,
            profileCrop: !hasPreMusicBrainzUpload && mediaStatus?.profileCrop
                ? mediaStatus.profileCrop
                : prev.profileCrop
        }));
        setError(null);
        setMusicBrainzLocationStatus(null);

        if (!originalLocationQuery && !activeLocationQuery) {
            setMusicBrainzLocationSearches({
                originalLocation: null,
                activeLocation: null
            });
            setQueuedMusicBrainzActiveLocationSearch(null);
            if (hasAutofilledInfo) {
                setMusicBrainzLocationStatus('MusicBrainz has no usable area for this artist.');
            }
            return;
        }

        const key = Date.now();
        setMusicBrainzLocationSearches({
            originalLocation: originalLocationQuery ? { query: originalLocationQuery, key } : null,
            activeLocation: !originalLocationQuery && activeLocationQuery ? { query: activeLocationQuery, key: key + 1 } : null
        });
        setQueuedMusicBrainzActiveLocationSearch(originalLocationQuery ? activeLocationQuery || null : null);
        setMusicBrainzLocationStatus('Career years and social media links auto-filled. Choose locations from the search results.');
    }, [
        buildLocationQuery,
        formData.musicbrainzMbid,
        formData.sourceImage,
        getMusicBrainzSocialLinks,
        hasSocialLinks,
        parseYear,
    ]);

    const updateDebutYear = useCallback((year: number | undefined) => {
        setFormData(prev => ({ ...prev, debutYear: year }));
    }, []);

    const updateInactiveYear = useCallback((year: number | undefined) => {
        setFormData(prev => ({ ...prev, inactiveYear: year }));
    }, []);

    // Upload image to Cloudinary and return the URL
    const handleImageUpload = useCallback(async (file: File): Promise<string | null> => {
        setIsUploadingImage(true);
        setUploadError(null);

        try {
            const imageUrl = await uploadImageToCloudinary(file);
            setFormData(prev => ({
                ...prev,
                sourceImage: imageUrl
            }));
            return imageUrl;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : t('artistForm.errors.failedUploadImage');
            setUploadError(errorMessage);
            console.error('Image upload error:', err);
            return null;
        } finally {
            setIsUploadingImage(false);
        }
    }, [t]);

    const clearImage = useCallback(() => {
        setFormData(prev => ({
            ...prev,
            sourceImage: '',
            avatarCrop: undefined,
            profileCrop: undefined
        }));
    }, []);

    // Update crop coordinates
    const updateCrops = useCallback((avatarCrop: CropArea, profileCrop: CropArea) => {
        setFormData(prev => ({
            ...prev,
            avatarCrop,
            profileCrop
        }));
    }, []);

    const validateForm = useCallback((): string | null => {
        if (!formData.name || formData.name.trim() === '') {
            return t('artistForm.errors.nameRequired');
        }

        if (!hasValidCoordinates(formData.originalLocation)) {
            return t('artistForm.errors.originalLocationRequired');
        }

        if (!hasValidCoordinates(formData.activeLocation)) {
            return t('artistForm.errors.activeLocationRequired');
        }

        const socialValidation = validateAllSocialLinks(formData.socialLinks, {
            invalidWebsite: t('artistForm.errors.invalidWebsiteUrl'),
            invalidProfile: (platform) => t('artistForm.errors.invalidSocialProfileUrl', { platform }),
        });
        if (!socialValidation.isValid) {
            const firstError = Object.values(socialValidation.errors)[0];
            return firstError || t('artistForm.errors.invalidSocialLinkUrl');
        }

        return null;
    }, [formData.name, formData.originalLocation, formData.activeLocation, formData.socialLinks, t]);

    const handleSave = useCallback(async () => {
        setError(null);

        const validationError = validateForm();
        if (validationError) {
            setError(validationError);
            return;
        }

        setIsSaving(true);

        try {
            let savedArtist: Artist;

            if (initialData?.id) {
                savedArtist = await updateArtist(initialData.id, formData);
            } else {
                savedArtist = await createArtist(formData);
            }

            await queryClient.invalidateQueries({ queryKey: ['artists'] });

            onSuccess?.(savedArtist);
            onCancel?.();
        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string; error?: string } }; message?: string };
            let errorMessage = t('artistForm.errors.failedSaveArtist');

            if (error.response?.data?.message) {
                errorMessage = error.response.data.message;
            } else if (error.response?.data?.error) {
                errorMessage = error.response.data.error;
            } else if (error.message) {
                errorMessage = error.message;
            }

            setError(errorMessage);
        } finally {
            setIsSaving(false);
        }
    }, [formData, initialData?.id, validateForm, queryClient, onSuccess, onCancel, t]);

    return {
        formData,
        setFormData,
        isSaving,
        error,
        musicBrainzLocationStatus,
        musicBrainzLocationSearches,
        locationInputSyncKeys,
        pendingField,
        isUploadingImage,
        uploadError,
        handleLocationSelect,
        handleSave,
        copyOriginalToActive,
        startManualPinSelection,
        clearPendingField,
        clearError,
        updateSocialLink,
        updateName,
        applyMusicBrainzArtist,
        updateDebutYear,
        updateInactiveYear,
        handleImageUpload,
        clearImage,
        clearUploadError,
        updateCrops,
        isEditing
    };
};

/**
 * Hook to handle the map selection flow coordination.
 * Keeps the useEffect logic isolated and properly handles dependencies.
 */
export const useMapSelectionHandler = (
    pendingField: 'originalLocation' | 'activeLocation' | null,
    pendingLocationResult: SearchResult | null | undefined,
    onLocationSelect: (result: SearchResult, field: 'originalLocation' | 'activeLocation') => void,
    onComplete: () => void,
    onConsumePendingResult?: () => void
) => {
    useEffect(() => {
        if (pendingField && pendingLocationResult !== undefined) {
            if (pendingLocationResult) {
                onLocationSelect(pendingLocationResult, pendingField);
            }
            onComplete();
            onConsumePendingResult?.();
        }
    }, [pendingField, pendingLocationResult, onLocationSelect, onComplete, onConsumePendingResult]);
};
