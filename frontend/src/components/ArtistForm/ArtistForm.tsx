import { useEffect, useId, useState, useRef } from 'react';
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
import { hasValidCoordinates } from '../../utils/locationUtils';
import { Alert, IconButton, Button, Input, Spinner } from '../ui';
import type { Artist } from '../../types/artist';
import type { MusicBrainzCatalogArtist } from '../../services/api';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';

// Artist creation and editing form experience

interface ArtistFormProps {
    initialData?: Artist;
    onSubmit?: (data: Partial<Artist>) => void;
    onCancel?: () => void;
    onRequestSelection?: (targetField: 'originalLocation' | 'activeLocation') => void;
    pendingCoordinates?: { lat: number; lng: number } | null;
    onConsumePendingCoordinates?: () => void;
    onTutorialAction?: (action: 'artistSelected' | 'originalLocationSet' | 'activeLocationSet' | 'debutYearSet' | 'inactiveEnabled' | 'inactiveDisabled' | 'inactiveYearSet' | 'artistImageSet' | 'socialOpened') => void;
    onTutorialImageStateChange?: (hasImage: boolean) => void;
    onTutorialComplete?: () => void;
}

const SOCIAL_FIELD_CONFIG: Omit<SocialLinkField, 'placeholder'>[] = [
    { key: 'website', icon: HomeIcon },
    { key: 'instagram', icon: InstagramIcon },
    { key: 'twitter', icon: XIcon },
    { key: 'appleMusic', icon: MusicIcon },
    { key: 'youtube', icon: YoutubeIcon },
];

const dialogActionButtonClass = 'inline-flex min-h-10 min-w-16 items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface';
const dialogCancelButtonClass = `${dialogActionButtonClass} text-text-secondary hover:bg-surface-muted hover:text-text`;
const dialogConfirmButtonClass = `${dialogActionButtonClass} text-primary-contrast hover:bg-primary-contrast/10`;

interface MediaWarningDialogProps {
    warning: {
        mode: 'avatar' | 'profile';
        source: 'file' | 'url';
        imageUrl?: string;
        status: ArtistMediaAssetStatus;
    };
    onCancel: () => void;
    onContinue: () => void;
}

function MediaWarningDialog({ warning, onCancel, onContinue }: MediaWarningDialogProps) {
    const { t } = useTranslation();
    const dialogRef = useDialogAccessibility(onCancel);
    const titleId = useId();
    const descriptionId = useId();

    return (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center px-4">
            <div aria-hidden="true" className="absolute inset-0 bg-black/30" onClick={onCancel} />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                tabIndex={-1}
                className="relative w-full max-w-sm rounded-xl border border-border bg-surface p-4 shadow-xl focus:outline-none"
            >
                <h2 id={titleId} className="text-base font-semibold text-text">
                    {warning.status.requiresReview ? t('artistForm.mediaReview.requiresReviewTitle') : t('artistForm.mediaReview.replaceSharedTitle')}
                </h2>
                <p id={descriptionId} className="mt-2 text-sm text-text-secondary">
                    {warning.status.requiresReview
                        ? t('artistForm.mediaReview.requiresReviewDescription')
                        : t('artistForm.mediaReview.replaceSharedDescription')}
                </p>
                {warning.status.sourceImage && (
                    <div className="mt-3">
                        <p className="mb-1 text-xs font-medium text-text-secondary">{t('artistForm.mediaReview.currentImage')}</p>
                        <img
                            src={warning.status.sourceImage}
                            alt={t('artistForm.mediaReview.currentSharedArtistAlt')}
                            className="aspect-video w-full rounded border border-border bg-surface-muted object-cover"
                        />
                    </div>
                )}
                <div className="mt-4 flex justify-end gap-2">
                    <button
                        type="button"
                        className={dialogCancelButtonClass}
                        onClick={onCancel}
                    >
                        {t('artistForm.buttons.cancel')}
                    </button>
                    <button
                        type="button"
                        className={dialogConfirmButtonClass}
                        onClick={onContinue}
                    >
                        {t('artistForm.buttons.continue')}
                    </button>
                </div>
            </div>
        </div>
    );
}

interface ImageUrlDialogProps {
    mode: 'avatar' | 'profile';
    value: string;
    error: string | null;
    uploadError: string | null;
    isUploading: boolean;
    onValueChange: (value: string) => void;
    onCancel: () => void;
    onSubmit: () => void;
}

function ImageUrlDialog({ mode, value, error, uploadError, isUploading, onValueChange, onCancel, onSubmit }: ImageUrlDialogProps) {
    const { t } = useTranslation();
    const dialogRef = useDialogAccessibility(onCancel);
    const titleId = useId();
    const descriptionId = useId();
    const inputId = useId();
    const isBanner = mode === 'profile';

    return (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center px-4">
            <div aria-hidden="true" className="absolute inset-0 bg-black/30" onClick={onCancel} />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                tabIndex={-1}
                className="relative w-full max-w-md rounded-xl border border-border bg-surface p-4 shadow-xl focus:outline-none"
            >
                <h2 id={titleId} className="text-base font-semibold text-text">
                    {isBanner ? t('artistForm.imageSource.bannerTitle') : t('artistForm.imageSource.avatarTitle')}
                </h2>
                <p id={descriptionId} className="mt-2 text-sm text-text-secondary whitespace-pre-line">
                    {t('artistForm.imageSource.description')}
                </p>
                <label htmlFor={inputId} className="mt-4 block text-sm font-medium text-text">
                    {t('artistForm.imageSource.inputLabel')}
                </label>
                <Input
                    id={inputId}
                    value={value}
                    onChange={(e) => onValueChange(e.target.value)}
                    placeholder={t('artistForm.imageSource.placeholder')}
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        onSubmit();
                    }}
                    className="mt-2"
                />
                {(error || uploadError) && (
                    <Alert variant="error" header={t('artistForm.errors.imageUploadFailed')} className="mt-3">
                        <span className="block">{error || uploadError}</span>
                    </Alert>
                )}
                <div className="mt-4 flex justify-end gap-2">
                    <button type="button" className={dialogCancelButtonClass} onClick={onCancel}>
                        {t('artistForm.buttons.cancel')}
                    </button>
                    <button
                        type="button"
                        className={`${dialogConfirmButtonClass} ${isUploading ? 'opacity-60 pointer-events-none' : ''}`}
                        onClick={onSubmit}
                        disabled={isUploading}
                    >
                        {isUploading ? (
                            <span className="flex items-center gap-2">
                                <Spinner size="sm" />
                                {t('artistForm.imageSource.useUrl')}
                            </span>
                        ) : (
                            t('artistForm.imageSource.useUrl')
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

interface PreUploadSelectionDialogProps {
    warning: {
        artist: MusicBrainzCatalogArtist;
        status: ArtistMediaAssetStatus;
    };
    uploadedSourceImage?: string;
    uploadedProfileCrop?: Artist['profileCrop'];
    choice: 'shared' | 'upload';
    onChoiceChange: (choice: 'shared' | 'upload') => void;
    onCancel: () => void;
    onConfirm: () => void;
}

function PreUploadSelectionDialog({ warning, uploadedSourceImage, uploadedProfileCrop, choice, onChoiceChange, onCancel, onConfirm }: PreUploadSelectionDialogProps) {
    const { t } = useTranslation();
    const dialogRef = useDialogAccessibility(onCancel);
    const titleId = useId();
    const descriptionId = useId();

    return (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center px-4">
            <div aria-hidden="true" className="absolute inset-0 bg-black/30" onClick={onCancel} />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                tabIndex={-1}
                className="relative w-full max-w-md rounded-xl border border-border bg-surface p-4 shadow-xl focus:outline-none"
            >
                <h2 id={titleId} className="text-base font-semibold text-text">{t('artistForm.mediaReview.artistImageExistsTitle')}</h2>
                <div id={descriptionId}>
                    <p className="mt-2 text-sm text-text-secondary">
                        {t('artistForm.mediaReview.sharedImageRecommendation')}
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">
                        {t('artistForm.mediaReview.submitForReviewDescription')}
                    </p>
                    <p className="mt-4 text-xs font-medium text-text-secondary">{t('artistForm.mediaReview.chooseImage')}</p>
                </div>
                <div className="mt-4 space-y-3">
                    <button
                        type="button"
                        onClick={() => onChoiceChange('shared')}
                        className={`relative block w-full overflow-hidden rounded-md transition-all ${
                            choice === 'shared'
                                ? 'shadow-md ring-2 ring-text-secondary'
                                : 'opacity-80 shadow-none hover:opacity-100 hover:ring-1 hover:ring-border'
                        }`}
                    >
                        <img
                            src={getProfileUrl(
                                warning.status.sourceImage || undefined,
                                warning.status.profileCrop || undefined
                            )}
                            alt={t('artistForm.mediaReview.currentSharedArtistAlt')}
                            className="block aspect-[3/1] w-full bg-surface-muted object-cover"
                        />
                        {choice === 'shared' && (
                            <span className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 text-text shadow">
                                <CheckCircleIcon className="h-5 w-5" />
                            </span>
                        )}
                        <span className={`absolute bottom-2 right-2 rounded px-2 py-1 text-xs font-medium leading-none text-white shadow-sm ${
                            choice === 'shared' ? 'bg-text-secondary' : 'bg-text-secondary/80'
                        }`}>
                            {t('artistForm.mediaReview.sharedImage')}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => onChoiceChange('upload')}
                        className={`relative block w-full overflow-hidden rounded-md transition-all ${
                            choice === 'upload'
                                ? 'shadow-md ring-2 ring-text-secondary'
                                : 'opacity-80 shadow-none hover:opacity-100 hover:ring-1 hover:ring-border'
                        }`}
                    >
                        <img
                            src={getProfileUrl(uploadedSourceImage, uploadedProfileCrop)}
                            alt={t('artistForm.mediaReview.yourUploadedArtistAlt')}
                            className="block aspect-[3/1] w-full bg-surface-muted object-cover"
                        />
                        {choice === 'upload' && (
                            <span className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 text-text shadow">
                                <CheckCircleIcon className="h-5 w-5" />
                            </span>
                        )}
                        <span className={`absolute bottom-2 right-2 rounded px-2 py-1 text-xs font-medium leading-none text-white shadow-sm ${
                            choice === 'upload' ? 'bg-text-secondary' : 'bg-text-secondary/80'
                        }`}>
                            {t('artistForm.mediaReview.yourUpload')}
                        </span>
                    </button>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                    <button type="button" className={dialogCancelButtonClass} onClick={onCancel}>
                        {t('artistForm.buttons.cancel')}
                    </button>
                    <button type="button" className={dialogConfirmButtonClass} onClick={onConfirm}>
                        {t('artistForm.buttons.confirm')}
                    </button>
                </div>
            </div>
        </div>
    );
}

const ArtistForm = ({
    initialData,
    onSubmit,
    onCancel,
    onRequestSelection,
    pendingCoordinates,
    onConsumePendingCoordinates,
    onTutorialAction,
    onTutorialImageStateChange,
    onTutorialComplete
}: ArtistFormProps) => {
    const [isSocialExpanded, setIsSocialExpanded] = useState(false);
    const [showInactive, setShowInactive] = useState(() => !!initialData?.inactiveYear);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const formScrollRef = useRef<HTMLDivElement>(null);
    const socialSectionRef = useRef<HTMLDivElement>(null);
    const sessionUploadedUrlsRef = useRef<Set<string>>(new Set());
    const [cropperInitialMode, setCropperInitialMode] = useState<'avatar' | 'profile'>('avatar');
    const [imageUrlMode, setImageUrlMode] = useState<'avatar' | 'profile' | null>(null);
    const [imageUrlValue, setImageUrlValue] = useState('');
    const [imageUrlError, setImageUrlError] = useState<string | null>(null);

    // Cropper state - simplified: just need to know if it's open and have the image
    const [isCropperOpen, setIsCropperOpen] = useState(false);
    const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null);
    const [mediaWarning, setMediaWarning] = useState<{
        mode: 'avatar' | 'profile';
        source: 'file' | 'url';
        imageUrl?: string;
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
        socialLinkErrors,
        musicBrainzLocationStatus,
        musicBrainzLocationSearches,
        locationInputSyncKeys,
        pendingField,
        isUploadingImage,
        uploadError,
        clearUploadError,
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
        handleImageUploadFromWebUrl,
        clearImage,
        updateCrops,
    } = useArtistForm({
        initialData,
        onSuccess: onSubmit,
        onCancel
    });

    useEffect(() => {
        onTutorialImageStateChange?.(Boolean(formData.sourceImage));
    }, [formData.sourceImage, onTutorialImageStateChange]);


    useEffect(() => {
        if (formData.inactiveYear === undefined) return;

        // MusicBrainz end dates reveal the inactive-year control
        setShowInactive(true);
    }, [formData.inactiveYear]);

    useEffect(() => {
        if (Object.keys(socialLinkErrors).length === 0) return;

        // Save-time URL errors reveal the social section
        setIsSocialExpanded(true);
    }, [socialLinkErrors]);

    useEffect(() => {
        if (!isSocialExpanded) return;

        const scroller = formScrollRef.current;
        const section = socialSectionRef.current;
        if (!scroller || !section) return;

        // Bring the expanded social section to the top of the form's scroll area.
        const delta = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: 'smooth' });
    }, [isSocialExpanded]);

    useEffect(() => {
        const scrollElement = formScrollRef.current;
        if (!scrollElement) return;

        const syncContentWidth = () => {
            scrollElement.style.setProperty('--artist-form-scroll-content-width', `${scrollElement.offsetWidth}px`);
        };

        syncContentWidth();

        const resizeObserver = new ResizeObserver(syncContentWidth);
        resizeObserver.observe(scrollElement);
        window.addEventListener('resize', syncContentWidth);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', syncContentWidth);
        };
    }, []);

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

    const isCountryLevelLocation = (location?: { type?: string }) => (
        location?.type?.toLowerCase() === 'country'
    );

    const getLocationFieldStatus = (location?: { coordinates?: { lat: number; lng: number }; type?: string }) => {
        if (!hasValidCoordinates(location)) return undefined;
        return isCountryLevelLocation(location) ? 'warning' : 'success';
    };

    const validateImageUrlInput = (value: string): string | null => {
        try {
            const url = new URL(value);
            if (!['http:', 'https:'].includes(url.protocol)) {
                return t('artistForm.errors.invalidImageUrl');
            }
            return null;
        } catch {
            return t('artistForm.errors.invalidImageUrl');
        }
    };

    const openFileImageEntry = () => {
        fileInputRef.current?.click();
    };

    const openImageUrlDialog = (mode: 'avatar' | 'profile') => {
        setCropperInitialMode(mode);
        setImageUrlMode(mode);
        setImageUrlValue('');
        setImageUrlError(null);
        clearUploadError();
    };

    const closeImageUrlDialog = () => {
        setImageUrlMode(null);
        setImageUrlValue('');
        setImageUrlError(null);
        clearUploadError();
    };

    const uploadImageUrlAndCrop = async (imageUrl: string) => {
        const uploadedUrl = await handleImageUploadFromWebUrl(imageUrl);
        if (!uploadedUrl) return false;

        sessionUploadedUrlsRef.current.add(uploadedUrl);
        setCropperImageSrc(uploadedUrl);
        setIsCropperOpen(true);
        setImageUrlMode(null);
        setImageUrlValue('');
        return true;
    };

    const requestLocalImageUpload = async (mode: 'avatar' | 'profile') => {
        setCropperInitialMode(mode);

        if (!formData.musicbrainzMbid) {
            openFileImageEntry();
            return;
        }

        try {
            const status = await getArtistMediaAssetStatus(formData.musicbrainzMbid);
            if (!status.hasAsset) {
                openFileImageEntry();
                return;
            }

            if (profile?.isAdmin || status.requiresReview) {
                setMediaWarning({ mode, source: 'file', status });
                return;
            }

            openFileImageEntry();
        } catch {
            openFileImageEntry();
        }
    };

    const requestWebUrlImageUpload = async (mode: 'avatar' | 'profile', imageUrl: string) => {
        setCropperInitialMode(mode);

        if (!formData.musicbrainzMbid) {
            await uploadImageUrlAndCrop(imageUrl);
            return;
        }

        try {
            const status = await getArtistMediaAssetStatus(formData.musicbrainzMbid);
            if (!status.hasAsset) {
                await uploadImageUrlAndCrop(imageUrl);
                return;
            }

            if (profile?.isAdmin || status.requiresReview) {
                closeImageUrlDialog();
                setMediaWarning({ mode, source: 'url', imageUrl, status });
                return;
            }

            await uploadImageUrlAndCrop(imageUrl);
        } catch {
            await uploadImageUrlAndCrop(imageUrl);
        }
    };

    const handleImageSourceSelect = (mode: 'avatar' | 'profile', source: 'file' | 'url') => {
        clearUploadError();
        if (source === 'file') {
            void requestLocalImageUpload(mode);
            return;
        }

        openImageUrlDialog(mode);
    };

    const handleImageUrlChange = (value: string) => {
        setImageUrlValue(value);
        if (imageUrlError) {
            setImageUrlError(null);
        }
        if (uploadError) {
            clearUploadError();
        }
    };

    const handleImageUrlSubmit = () => {
        const mode = imageUrlMode;
        const normalizedUrl = imageUrlValue.trim();
        if (isUploadingImage) return;
        if (!mode) return;

        const validationError = validateImageUrlInput(normalizedUrl);
        if (validationError) {
            setImageUrlError(validationError);
            return;
        }

        void requestWebUrlImageUpload(mode, normalizedUrl);
    };

    const continueAfterMediaWarning = () => {
        const warning = mediaWarning;
        setMediaWarning(null);
        if (!warning) return;

        if (warning.source === 'url' && warning.imageUrl) {
            void uploadImageUrlAndCrop(warning.imageUrl);
            return;
        }

        openFileImageEntry();
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
        onTutorialAction?.('artistImageSet');
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
            aria-label={t('artistForm.buttons.uploadFromDevice')}
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
            <MediaWarningDialog
                warning={mediaWarning}
                onCancel={() => setMediaWarning(null)}
                onContinue={continueAfterMediaWarning}
            />
        )}

        {imageUrlMode && (
            <ImageUrlDialog
                mode={imageUrlMode}
                value={imageUrlValue}
                error={imageUrlError}
                uploadError={uploadError}
                isUploading={isUploadingImage}
                onValueChange={handleImageUrlChange}
                onCancel={closeImageUrlDialog}
                onSubmit={handleImageUrlSubmit}
            />
        )}

        {preUploadSelectionWarning && (
            <PreUploadSelectionDialog
                warning={preUploadSelectionWarning}
                uploadedSourceImage={formData.sourceImage}
                uploadedProfileCrop={formData.profileCrop}
                choice={preUploadImageChoice}
                onChoiceChange={setPreUploadImageChoice}
                onCancel={() => setPreUploadSelectionWarning(null)}
                onConfirm={confirmPreUploadImageChoice}
            />
        )}

        <div className="absolute top-20 left-1/2 z-[1050] w-[calc(100vw-1rem)] max-w-sm -translate-x-1/2 bg-surface rounded-xl shadow-xl shadow-black/5 ring-1 ring-border/40 overflow-hidden flex flex-col max-h-[calc(100vh-6rem)] font-sans sm:top-28 sm:right-2 sm:left-auto sm:translate-x-0 sm:max-h-[calc(100vh-8rem)]">
            <div ref={formScrollRef} className="artist-form-scroll flex-1 overflow-y-auto">
                <div className="artist-form-scroll-content">
                    {/* Header with background and avatar */}
                    <ArtistFormHeader
                        name={formData.name || ''}
                        avatarUrl={avatarUrl}
                        profileUrl={profileUrl}
                        isUploading={isUploadingImage}
                        onSelectImageSource={handleImageSourceSelect}
                        onNameChange={updateName}
                    />

                    {/* Form content */}
                    <div className="mt-10 px-4 pb-4 flex flex-col gap-4">
                    {/* Upload error */}
                    {uploadError && !imageUrlMode && (
                        <Alert variant="error" header={t('artistForm.errors.imageUploadFailed')}>
                            <span className="block">{uploadError}</span>
                            <span className="mt-1 block text-xs">{t('artistForm.errors.imageRequirements')}</span>
                        </Alert>
                    )}

                    <MusicBrainzArtistPicker
                        value={formData.name}
                        selectedMbid={formData.musicbrainzMbid}
                        onNameChange={updateName}
                        onSelect={handleArtistSelect}
                    />
                    {musicBrainzLocationStatus && (
                        <div className="-mt-2 px-1 text-xs text-text-secondary">
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
                            status={getLocationFieldStatus(formData.originalLocation)}
                            statusMessage={t('artistForm.locationSearch.detailedLocationRecommended')}
                        />

                        <div className="flex justify-center -my-2 relative z-50">
                            <IconButton
                                data-tutorial-target="copy-origin-to-active"
                                aria-label={t('artistForm.buttons.copyOriginalToActive')}
                                onClick={handleCopyOriginalToActive}
                                size="sm"
                                className="bg-surface-muted border border-border text-text-secondary rounded-full hover:bg-primary hover:!text-white hover:border-primary app-dark:hover:!text-white"
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
                            status={getLocationFieldStatus(formData.activeLocation)}
                            statusMessage={t('artistForm.locationSearch.detailedLocationRecommended')}
                        />
                    </div>

                    <div data-tutorial-target="debut-year">
                        <div className="flex items-end gap-2">
                            <div className="flex-1">
                                <YearSelect label={t('artistForm.fields.debutYear')} value={formData.debutYear} onChange={handleDebutYearChange} placeholder={t('artistForm.fields.debut')} />
                            </div>
                            <div className="flex-1">
                                {showInactive ? (
                                    <YearSelect label={t('artistForm.fields.inactiveYear')} tutorialTarget="inactive-year" value={formData.inactiveYear} onChange={handleInactiveYearChange} placeholder={t('artistForm.fields.inactive')} />
                                ) : (
                                    <div className="flex min-h-10 items-center justify-center rounded-md p-1">
                                        <span className="px-3 py-1 text-sm font-medium text-text-secondary bg-surface-muted rounded-full">{t('artistForm.fields.present')}</span>
                                    </div>
                                )}
                            </div>
                            <IconButton
                                data-tutorial-target="inactive-toggle"
                                aria-label={showInactive ? t('artistForm.buttons.setActive') : t('artistForm.buttons.setInactive')}
                                onClick={toggleInactive}
                                title={showInactive ? t('artistForm.buttons.setActive') : t('artistForm.buttons.setInactive')}
                                className="text-text-secondary hover:text-primary app-dark:hover:text-primary"
                            >
                                {showInactive ? <MusicNoteIcon /> : <SleepIcon />}
                            </IconButton>
                        </div>
                    </div>

                    {/* Social Media section */}
                    <div ref={socialSectionRef} data-tutorial-target="social-links">
                        <button
                            aria-expanded={isSocialExpanded}  
                            onClick={toggleSocialExpanded}
                            className={`flex items-center justify-between w-full px-3 py-2 text-sm font-bold text-text bg-surface-secondary hover:bg-surface-muted rounded-lg transition-colors duration-150 ${isSocialExpanded ? 'rounded-b-none' : ''}`}
                            type="button"

                        >
                            <span>{t('artistForm.socialMedia.title')}</span>
                            <ChevronDownIcon aria-hidden="true" className={`w-4 h-4 text-text-muted transition-transform duration-200 ${isSocialExpanded ? 'rotate-180' : ''}`} />
                        </button>

                        {isSocialExpanded && (
                            <div className="px-3 py-3 flex flex-col gap-3 bg-surface-secondary rounded-b-lg">
                                {socialFields.map((field) => (
                                    <SocialLinkInput
                                        key={field.key}
                                        field={field}
                                        value={formData.socialLinks?.[field.key] || ''}
                                        onChange={updateSocialLink}
                                        externalError={socialLinkErrors[field.key]}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                    </div>
                </div>
            </div>

            {/* Footer with error and buttons */}
            <div className="border-t border-border/60 px-4 py-3.5 bg-surface">
                {error && (
                    <Alert variant="error" className="mb-3">
                        {error}
                    </Alert>
                )}
                <div className="flex gap-2.5">
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
