import { useState, useRef } from 'react';
import { ArrowDownIcon, MusicNoteIcon, SleepIcon } from '../icons/FormIcons';
import { CheckCircleIcon, ChevronDownIcon } from '../icons/GeneralIcons';
import { HomeIcon, MusicIcon, YoutubeIcon, InstagramIcon, XIcon } from '../icons/SocialIcons';
import { LocationSearch } from './LocationSearch';
import SocialLinkInput, { type SocialLinkField } from './SocialLinkInput';
import ImageCropper, { type CropResult } from './ImageCropper';
import ArtistFormHeader from './ArtistFormHeader';
import YearSelect from './YearSelect';
import { MusicBrainzArtistPicker } from './MusicBrainzArtistPicker';
import { useArtistForm } from '../../hooks/useArtistForm';
import { getAvatarUrl, getProfileUrl } from '../../utils/cloudinaryUrl';
import { deleteUploadedImage, getArtistMediaAssetStatus, type ArtistMediaAssetStatus } from '../../utils/cloudinary';
import { Alert, IconButton, Button } from '../ui';
import type { Artist } from '../../types/artist';
import type { MusicBrainzCatalogArtist } from '../../services/api';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';


interface ArtistFormProps {
    initialData?: Artist;
    onSubmit?: (data: Partial<Artist>) => void;
    onCancel?: () => void;
    onRequestSelection?: (targetField: 'originalLocation' | 'activeLocation') => void;
    pendingCoordinates?: { lat: number; lng: number } | null;
    onConsumePendingCoordinates?: () => void;
    onTutorialAction?: (action: 'artistSelected' | 'originalLocationSet' | 'activeLocationSet' | 'debutYearSet' | 'inactiveEnabled' | 'inactiveDisabled' | 'inactiveYearSet' | 'socialOpened') => void;
    onTutorialComplete?: () => void;
}

const SOCIAL_FIELD_CONFIG: Omit<SocialLinkField, 'placeholder'>[] = [
    { key: 'website', icon: HomeIcon },
    { key: 'instagram', icon: InstagramIcon },
    { key: 'twitter', icon: XIcon },
    { key: 'appleMusic', icon: MusicIcon },
    { key: 'youtube', icon: YoutubeIcon },
];

const ArtistForm = ({
    initialData,
    onSubmit,
    onCancel,
    onRequestSelection,
    pendingCoordinates,
    onConsumePendingCoordinates,
    onTutorialAction,
    onTutorialComplete
}: ArtistFormProps) => {
    const [isSocialExpanded, setIsSocialExpanded] = useState(false);
    const [showInactive, setShowInactive] = useState(() => !!initialData?.inactiveYear);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const sessionUploadedUrlsRef = useRef<Set<string>>(new Set());
    const [cropperInitialMode, setCropperInitialMode] = useState<'avatar' | 'profile'>('avatar');

    // Cropper state - simplified: just need to know if it's open and have the image
    const [isCropperOpen, setIsCropperOpen] = useState(false);
    const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null);
    const [mediaWarning, setMediaWarning] = useState<{
        mode: 'avatar' | 'profile';
        status: ArtistMediaAssetStatus;
    } | null>(null);
    const [preUploadSelectionWarning, setPreUploadSelectionWarning] = useState<{
        artist: MusicBrainzCatalogArtist;
        status: ArtistMediaAssetStatus;
    } | null>(null);
    const [preUploadImageChoice, setPreUploadImageChoice] = useState<'shared' | 'upload'>('shared');
    const { t } = useTranslation();
    const { profile } = useAuth();
    const socialFields: SocialLinkField[] = SOCIAL_FIELD_CONFIG.map((field) => ({
        ...field,
        placeholder: t(`artistForm.socialMedia.${field.key}`),
    }));

    const {
        formData,
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
        updateSocialLink,
        updateName,
        applyMusicBrainzArtist,
        updateDebutYear,
        updateInactiveYear,
        handleImageUpload,
        clearImage,
        updateCrops,
    } = useArtistForm({
        initialData,
        onSuccess: onSubmit,
        onCancel
    });

    const handleManualPin = (locationType: 'originalLocation' | 'activeLocation') => {
        startManualPinSelection(locationType);
        onRequestSelection?.(locationType);
    };

    // Get pending coordinates for the correct field
    const getPendingCoordinatesFor = (field: 'originalLocation' | 'activeLocation') => {
        return pendingField === field ? pendingCoordinates : null;
    };

    // Handle consuming coordinates for a specific field
    const handleCoordinatesConsumed = () => {
        clearPendingField();
        onConsumePendingCoordinates?.();
    };

    const getLocationDisplayValue = (location?: { displayName?: string; city?: string; province?: string; country?: string }) => {
        if (!location) return '';
        if (location.displayName) return location.displayName;
        if (location.city) {
            const parts = [location.city];
            if (location.province) parts.push(location.province);
            if (location.country) parts.push(location.country);
            return parts.join(', ');
        }
        return '';
    };

    const openImageEntry = (mode: 'avatar' | 'profile') => {
        setCropperInitialMode(mode);
        if (formData.sourceImage) {
            setCropperImageSrc(formData.sourceImage);
            setIsCropperOpen(true);
        } else {
            fileInputRef.current?.click();
        }
    };

    const requestImageEntry = async (mode: 'avatar' | 'profile') => {
        setCropperInitialMode(mode);

        if (!formData.musicbrainzMbid) {
            openImageEntry(mode);
            return;
        }

        try {
            const status = await getArtistMediaAssetStatus(formData.musicbrainzMbid);
            if (!status.hasAsset) {
                openImageEntry(mode);
                return;
            }

            if (profile?.isAdmin || status.requiresReview) {
                setMediaWarning({ mode, status });
                return;
            }

            openImageEntry(mode);
        } catch {
            openImageEntry(mode);
        }
    };

    const continueAfterMediaWarning = () => {
        const warning = mediaWarning;
        setMediaWarning(null);
        if (!warning) return;

        if (warning.status.requiresReview) {
            fileInputRef.current?.click();
            return;
        }

        openImageEntry(warning.mode);
    };

    const cleanupSessionUpload = async (imageUrl?: string | null) => {
        if (!imageUrl || !sessionUploadedUrlsRef.current.has(imageUrl)) return;
        sessionUploadedUrlsRef.current.delete(imageUrl);
        await deleteUploadedImage(imageUrl).catch((error) => {
            console.warn('Failed to clean up uploaded image:', error);
        });
    };

    const handleArtistSelect = async (artist: MusicBrainzCatalogArtist) => {
        if (formData.sourceImage && !formData.musicbrainzMbid) {
            const status = await getArtistMediaAssetStatus(artist.mbid).catch(() => null);
            if (status?.hasAsset && status.sourceImage) {
                setPreUploadImageChoice('shared');
                setPreUploadSelectionWarning({ artist, status });
                return;
            }
        }

        await applyMusicBrainzArtist(artist);
        onTutorialAction?.('artistSelected');
    };

    const handleTutorialLocationSelect = (result: Parameters<typeof handleLocationSelect>[0], locationType: 'originalLocation' | 'activeLocation') => {
        handleLocationSelect(result, locationType);
        // Move location tutorial after applying result
        onTutorialAction?.(locationType === 'originalLocation' ? 'originalLocationSet' : 'activeLocationSet');
    };

    const handleCopyOriginalToActive = () => {
        copyOriginalToActive();
        onTutorialAction?.('activeLocationSet');
    };

    const handleDebutYearChange = (year: number | undefined) => {
        updateDebutYear(year);
        if (year !== undefined) {
            onTutorialAction?.('debutYearSet');
        }
    };

    const handleInactiveYearChange = (year: number | undefined) => {
        updateInactiveYear(year);
        if (year !== undefined) {
            onTutorialAction?.('inactiveYearSet');
        }
    };

    const toggleInactive = () => {
        const nextShowInactive = !showInactive;
        setShowInactive(nextShowInactive);
        if (showInactive) {
            updateInactiveYear(undefined);
        }
        onTutorialAction?.(nextShowInactive ? 'inactiveEnabled' : 'inactiveDisabled');
    };

    const toggleSocialExpanded = () => {
        setIsSocialExpanded(!isSocialExpanded);
        onTutorialAction?.('socialOpened');
    };

    const confirmPreUploadImageChoice = async () => {
        const warning = preUploadSelectionWarning;
        setPreUploadSelectionWarning(null);
        if (!warning) return;

        if (preUploadImageChoice === 'upload') {
            await applyMusicBrainzArtist(warning.artist);
            return;
        }

        await cleanupSessionUpload(formData.sourceImage);
        await applyMusicBrainzArtist(warning.artist, { useSharedImage: true });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Upload to Cloudinary first
        const imageUrl = await handleImageUpload(file);

        if (imageUrl) {
            sessionUploadedUrlsRef.current.add(imageUrl);
            // Open cropper with the uploaded image
            setCropperImageSrc(imageUrl);
            setIsCropperOpen(true);
        }

        // Reset input so same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const closeCropper = () => { setIsCropperOpen(false); setCropperImageSrc(null); };

    const cancelCropper = async () => {
        const imageUrl = cropperImageSrc;
        closeCropper();
        await cleanupSessionUpload(imageUrl);
        if (imageUrl && formData.sourceImage === imageUrl) {
            clearImage();
        }
    };

    const handleCropSave = (result: CropResult) => {
        updateCrops(result.avatarCrop, result.profileCrop);
        closeCropper();
    };

    const handleReupload = async () => {
        const imageUrl = cropperImageSrc;
        closeCropper();
        await cleanupSessionUpload(imageUrl);
        if (imageUrl && formData.sourceImage === imageUrl) {
            clearImage();
        }
        fileInputRef.current?.click();
    };

    const handleCancelForm = async () => {
        const uploadsToClean = Array.from(sessionUploadedUrlsRef.current);
        sessionUploadedUrlsRef.current.clear();
        await Promise.all(uploadsToClean.map((url) => (
            deleteUploadedImage(url).catch((error) => {
                console.warn('Failed to clean up uploaded image:', error);
            })
        )));
        onCancel?.();
    };

    const handleSaveClick = () => {
        // Complete tutorial before saving
        onTutorialComplete?.();
        void handleSave();
    };

    // Get display URLs using Cloudinary transformations
    const avatarUrl = getAvatarUrl(formData.sourceImage, formData.avatarCrop);
    const profileUrl = getProfileUrl(formData.sourceImage, formData.profileCrop);

    return (
        <>
        {/* Hidden file input */}
        <input
            aria-label={t('artistForm.buttons.uploadAvatar')}
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
        />

        {isCropperOpen && cropperImageSrc && (
            <ImageCropper
                imageSrc={cropperImageSrc}
                initialAvatarCrop={formData.avatarCrop}
                initialProfileCrop={formData.profileCrop}
                initialMode={cropperInitialMode}
                onSave={handleCropSave}
                onCancel={() => { void cancelCropper(); }}
                onReupload={() => { void handleReupload(); }}
            />
        )}

        {mediaWarning && (
            <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/30">
                <div className="w-full max-w-sm rounded-lg bg-surface p-4 shadow-xl border border-border">
                    <h2 className="text-base font-semibold text-text">
                        {mediaWarning.status.requiresReview ? 'Image requires review' : 'Replace shared image?'}
                    </h2>
                    <p className="mt-2 text-sm text-text-secondary">
                        {mediaWarning.status.requiresReview
                            ? 'This artist already has a shared image. Your upload will be submitted for admin review before it becomes visible to everyone.'
                            : 'This artist already has a shared image. As an admin, continuing can replace the image shown to everyone.'}
                    </p>
                    {mediaWarning.status.sourceImage && (
                        <div className="mt-3">
                            <p className="mb-1 text-xs font-medium text-text-secondary">Current image</p>
                            <img
                                src={mediaWarning.status.sourceImage}
                                alt="Current shared artist"
                                className="w-full aspect-video rounded border border-border object-cover bg-surface-muted"
                            />
                        </div>
                    )}
                    <div className="mt-4 flex gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            className="flex-1"
                            onClick={() => setMediaWarning(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            className="flex-1"
                            onClick={continueAfterMediaWarning}
                        >
                            Continue
                        </Button>
                    </div>
                </div>
            </div>
        )}

        {preUploadSelectionWarning && (
            <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/30">
                <div className="w-full max-w-md rounded-lg bg-surface p-4 shadow-xl border border-border">
                    <h2 className="text-base font-semibold text-text">Artist image already exists</h2>
                    <p className="mt-2 text-sm text-text-secondary">
                        We highly recommend using shared artist image due to storage limits.
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">
                        If you think your image represents the artist better, you can submit it for review.
                    </p>
                    <p className="mt-4 text-xs font-medium text-text-secondary">Choose an image</p>
                    <div className="mt-4 space-y-3">
                        <div>
                            <button
                                type="button"
                                onClick={() => setPreUploadImageChoice('shared')}
                                className={`relative block w-full overflow-hidden rounded-md transition-all ${
                                    preUploadImageChoice === 'shared'
                                        ? 'shadow-md ring-2 ring-text-secondary'
                                        : 'opacity-80 shadow-none hover:opacity-100 hover:ring-1 hover:ring-border'
                                }`}
                            >
                                <img
                                    src={getProfileUrl(
                                        preUploadSelectionWarning.status.sourceImage || undefined,
                                        preUploadSelectionWarning.status.profileCrop || undefined
                                    )}
                                    alt="Current shared artist"
                                    className="block w-full aspect-[3/1] object-cover bg-surface-muted"
                                />
                                {preUploadImageChoice === 'shared' && (
                                    <span className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-text shadow">
                                        <CheckCircleIcon className="h-5 w-5" />
                                    </span>
                                )}
                                <span className={`absolute bottom-2 right-2 rounded px-2 py-1 text-xs font-medium leading-none text-white shadow-sm ${
                                    preUploadImageChoice === 'shared' ? 'bg-text-secondary' : 'bg-text/60'
                                }`}>
                                    Shared image
                                </span>
                            </button>
                        </div>
                        <div>
                            <button
                                type="button"
                                onClick={() => setPreUploadImageChoice('upload')}
                                className={`relative block w-full overflow-hidden rounded-md transition-all ${
                                    preUploadImageChoice === 'upload'
                                        ? 'shadow-md ring-2 ring-text-secondary'
                                        : 'opacity-80 shadow-none hover:opacity-100 hover:ring-1 hover:ring-border'
                                }`}
                            >
                                <img
                                    src={getProfileUrl(formData.sourceImage, formData.profileCrop)}
                                    alt="Your uploaded artist"
                                    className="block w-full aspect-[3/1] object-cover bg-surface-muted"
                                />
                                {preUploadImageChoice === 'upload' && (
                                    <span className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-text shadow">
                                        <CheckCircleIcon className="h-5 w-5" />
                                    </span>
                                )}
                                <span className={`absolute bottom-2 right-2 rounded px-2 py-1 text-xs font-medium leading-none text-white shadow-sm ${
                                    preUploadImageChoice === 'upload' ? 'bg-text-secondary' : 'bg-text/60'
                                }`}>
                                    Your upload
                                </span>
                            </button>
                        </div>
                    </div>
                    <div className="mt-4">
                        <Button
                            type="button"
                            className="w-full"
                            onClick={confirmPreUploadImageChoice}
                        >
                            Confirm
                        </Button>
                    </div>
                </div>
            </div>
        )}

        <div className="absolute top-28 right-2 z-[1050] w-80 bg-surface rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[calc(100vh-8rem)] font-sans">
            <div className="overflow-y-auto flex-1">
                {/* Header with background and avatar */}
                <ArtistFormHeader
                    name={formData.name || ''}
                    avatarUrl={avatarUrl}
                    profileUrl={profileUrl}
                    isUploading={isUploadingImage}
                    onAvatarClick={() => void requestImageEntry('avatar')}
                    onProfileClick={() => void requestImageEntry('profile')}
                    onNameChange={updateName}
                />

                {/* Form content */}
                <div className="mt-10 px-4 pb-4 flex flex-col gap-4">
                    {/* Upload error */}
                    {uploadError && (
                        <Alert variant="error">{uploadError}</Alert>
                    )}

                    <MusicBrainzArtistPicker
                        value={formData.name}
                        selectedMbid={formData.musicbrainzMbid}
                        onNameChange={updateName}
                        onSelect={handleArtistSelect}
                    />
                    {musicBrainzLocationStatus && (
                        <div className="text-xs text-text-secondary -mt-2">
                            {musicBrainzLocationStatus}
                        </div>
                    )}

                    {/* Location inputs */}
                    <div className="space-y-4">
                        <LocationSearch
                            tutorialInputTarget="origin-location-field"
                            displayValue={getLocationDisplayValue(formData.originalLocation)}
                            onChange={(result) => handleTutorialLocationSelect(result, 'originalLocation')}
                            onManualPin={() => handleManualPin('originalLocation')}
                            placeholder={t('artistForm.fields.searchOriginalLocation')}
                            label={t('artistForm.fields.originalLocation')}
                            pendingCoordinates={getPendingCoordinatesFor('originalLocation')}
                            onCoordinatesConsumed={handleCoordinatesConsumed}
                            pendingSearch={musicBrainzLocationSearches.originalLocation}
                            syncKey={locationInputSyncKeys.originalLocation}
                        />

                        <div className="flex justify-center -my-2 relative z-50">
                            <IconButton
                                data-tutorial-target="copy-origin-to-active"
                                aria-label={t('artistForm.buttons.copyOriginalToActive')}
                                onClick={handleCopyOriginalToActive}
                                size="sm"
                                className="bg-surface-muted border border-border text-text-secondary rounded-full hover:bg-primary hover:text-white hover:border-primary"
                                title={t('artistForm.buttons.copyOriginalToActive')}
                                type="button"
                            >
                                <ArrowDownIcon className="w-4 h-4" />
                            </IconButton>
                        </div>

                        <LocationSearch
                            tutorialInputTarget="active-location-field"
                            displayValue={getLocationDisplayValue(formData.activeLocation)}
                            onChange={(result) => handleTutorialLocationSelect(result, 'activeLocation')}
                            onManualPin={() => handleManualPin('activeLocation')}
                            placeholder={t('artistForm.fields.searchActiveLocation')}
                            label={t('artistForm.fields.activeLocation')}
                            pendingCoordinates={getPendingCoordinatesFor('activeLocation')}
                            onCoordinatesConsumed={handleCoordinatesConsumed}
                            pendingSearch={musicBrainzLocationSearches.activeLocation}
                            syncKey={locationInputSyncKeys.activeLocation}
                        />
                    </div>

                    <div data-tutorial-target="debut-year" className="rounded-md p-1">
                        <span className="block text-sm font-bold text-text mb-1">{t('artistForm.fields.careerYears')}</span>
                        <div className="flex items-center gap-2">
                            <div className="flex-1">
                                <YearSelect value={formData.debutYear} onChange={handleDebutYearChange} placeholder={t('artistForm.fields.debut')} />
                            </div>
                            <div className="flex-1">
                                {showInactive ? (
                                    <YearSelect tutorialTarget="inactive-year" value={formData.inactiveYear} onChange={handleInactiveYearChange} placeholder={t('artistForm.fields.inactive')} />
                                ) : (
                                    <div className="h-full flex items-center justify-center">
                                        <span className="px-3 py-1 text-sm font-medium text-text-secondary bg-surface-muted rounded-full">{t('artistForm.fields.present')}</span>
                                    </div>
                                )}
                            </div>
                            <IconButton
                                data-tutorial-target="inactive-toggle"
                                aria-label={showInactive ? t('artistForm.buttons.setActive') : t('artistForm.buttons.setInactive')}
                                onClick={toggleInactive}
                                title={showInactive ? t('artistForm.buttons.setActive') : t('artistForm.buttons.setInactive')}
                            >
                                {showInactive ? <MusicNoteIcon /> : <SleepIcon />}
                            </IconButton>
                        </div>
                    </div>

                    {/* Social Media section */}
                    <div data-tutorial-target="social-links">
                        <button
                            aria-expanded={isSocialExpanded}  
                            onClick={toggleSocialExpanded}
                            className={`flex items-center justify-between w-full px-3 py-2 text-sm font-bold text-text bg-surface-secondary hover:bg-surface-muted rounded-md transition-colors ${isSocialExpanded ? 'rounded-b-none' : ''}`}
                            type="button"

                        >
                            <span>{t('artistForm.socialMedia.title')}</span>
                            <ChevronDownIcon aria-hidden="true" className={`w-4 h-4 text-text-muted transition-transform duration-200 ${isSocialExpanded ? 'rotate-180' : ''}`} />
                        </button>

                        {isSocialExpanded && (
                            <div className="px-3 py-3 flex flex-col gap-3 bg-surface-secondary rounded-b-md">
                                {socialFields.map((field) => (
                                    <SocialLinkInput
                                        key={field.key}
                                        field={field}
                                        value={formData.socialLinks?.[field.key] || ''}
                                        onChange={updateSocialLink}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer with error and buttons */}
            <div className="p-4 border-border bg-surface">
                {error && (
                    <Alert variant="error" className="mb-3">{error}</Alert>
                )}
                <div className="flex gap-3">
                    <Button
                        onClick={() => { void handleCancelForm(); }}
                        disabled={isSaving}
                        variant="secondary"
                        className="flex-1"
                        type="button"
                    >
                        {t('artistForm.buttons.cancel')}
                    </Button>
                    <Button
                        data-tutorial-target="save-artist"
                        onClick={handleSaveClick}
                        isLoading={isSaving}
                        className="flex-1"
                        type="button"
                    >
                        {t('artistForm.buttons.save')}
                    </Button>
                </div>
            </div>
        </div>
        </>
    );
};

export default ArtistForm;
