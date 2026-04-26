import { useState, useRef } from 'react';
import { ArrowDownIcon, MusicNoteIcon, SleepIcon } from '../icons/FormIcons';
import { ChevronDownIcon } from '../icons/GeneralIcons';
import { HomeIcon, MusicIcon, YoutubeIcon, InstagramIcon, XIcon } from '../icons/SocialIcons';
import { LocationSearch } from './LocationSearch';
import SocialLinkInput, { type SocialLinkField } from './SocialLinkInput';
import ImageCropper, { type CropResult } from './ImageCropper';
import ArtistFormHeader from './ArtistFormHeader';
import YearSelect from './YearSelect';
import { MusicBrainzArtistPicker } from './MusicBrainzArtistPicker';
import { useArtistForm } from '../../hooks/useArtistForm';
import { getAvatarUrl, getProfileUrl } from '../../utils/cloudinaryUrl';
import { Alert, IconButton, Button } from '../ui';
import type { Artist } from '../../types/artist';
import { useTranslation } from 'react-i18next';


interface ArtistFormProps {
    initialData?: Artist;
    onSubmit?: (data: Partial<Artist>) => void;
    onCancel?: () => void;
    onRequestSelection?: (targetField: 'originalLocation' | 'activeLocation') => void;
    pendingCoordinates?: { lat: number; lng: number } | null;
    onConsumePendingCoordinates?: () => void;
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
    onConsumePendingCoordinates
}: ArtistFormProps) => {
    const [isSocialExpanded, setIsSocialExpanded] = useState(false);
    const [showInactive, setShowInactive] = useState(() => !!initialData?.inactiveYear);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [cropperInitialMode, setCropperInitialMode] = useState<'avatar' | 'profile'>('avatar');

    // Cropper state - simplified: just need to know if it's open and have the image
    const [isCropperOpen, setIsCropperOpen] = useState(false);
    const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null);
    const { t } = useTranslation();
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

    
    const openCropper = (mode: 'avatar' | 'profile') => {
        setCropperInitialMode(mode);
        if (formData.sourceImage) {
            setCropperImageSrc(formData.sourceImage);
            setIsCropperOpen(true);
        } else {
            fileInputRef.current?.click();
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Upload to Cloudinary first
        const imageUrl = await handleImageUpload(file);

        if (imageUrl) {
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

    const handleCropSave = (result: CropResult) => {
        updateCrops(result.avatarCrop, result.profileCrop);
        closeCropper();
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
                onCancel={closeCropper}
                onReupload={() => { closeCropper(); fileInputRef.current?.click(); }}
            />
        )}

        <div className="absolute top-28 right-2 z-[1050] w-80 bg-surface rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[calc(100vh-8rem)] font-sans">
            <div className="overflow-y-auto flex-1 [scrollbar-gutter:stable]">
                {/* Header with background and avatar */}
                <ArtistFormHeader
                    name={formData.name || ''}
                    avatarUrl={avatarUrl}
                    profileUrl={profileUrl}
                    isUploading={isUploadingImage}
                    onAvatarClick={() => openCropper('avatar')}
                    onProfileClick={() => openCropper('profile')}
                    onNameChange={updateName}
                />

                {/* Form content */}
                <div className="mt-10 px-4 flex flex-col gap-4">
                    {/* Upload error */}
                    {uploadError && (
                        <Alert variant="error">{uploadError}</Alert>
                    )}

                    <MusicBrainzArtistPicker
                        value={formData.name}
                        selectedMbid={formData.musicbrainzMbid}
                        onNameChange={updateName}
                        onSelect={applyMusicBrainzArtist}
                    />
                    {musicBrainzLocationStatus && (
                        <div className="text-xs text-text-secondary -mt-2">
                            {musicBrainzLocationStatus}
                        </div>
                    )}

                    {/* Location inputs */}
                    <div className="space-y-4">
                        <LocationSearch
                            displayValue={getLocationDisplayValue(formData.originalLocation)}
                            onChange={(result) => handleLocationSelect(result, 'originalLocation')}
                            onManualPin={() => handleManualPin('originalLocation')}
                            placeholder={t('artistForm.fields.searchOriginalLocation')}
                            label={t('artistForm.fields.originalLocation')}
                            pendingCoordinates={getPendingCoordinatesFor('originalLocation')}
                            onCoordinatesConsumed={handleCoordinatesConsumed}
                            pendingSearch={musicBrainzLocationSearches.originalLocation}
                        />

                        <div className="flex justify-center -my-2 relative z-10">
                            <IconButton
                                aria-label={t('artistForm.buttons.copyOriginalToActive')}
                                onClick={copyOriginalToActive}
                                size="sm"
                                className="bg-surface-muted border border-border text-text-secondary rounded-full hover:bg-primary hover:text-white hover:border-primary"
                                title={t('artistForm.buttons.copyOriginalToActive')}
                                type="button"
                            >
                                <ArrowDownIcon className="w-4 h-4" />
                            </IconButton>
                        </div>

                        <LocationSearch
                            displayValue={getLocationDisplayValue(formData.activeLocation)}
                            onChange={(result) => handleLocationSelect(result, 'activeLocation')}
                            onManualPin={() => handleManualPin('activeLocation')}
                            placeholder={t('artistForm.fields.searchActiveLocation')}
                            label={t('artistForm.fields.activeLocation')}
                            pendingCoordinates={getPendingCoordinatesFor('activeLocation')}
                            onCoordinatesConsumed={handleCoordinatesConsumed}
                            pendingSearch={musicBrainzLocationSearches.activeLocation}
                        />
                    </div>

                    <div>
                        <span className="block text-sm font-bold text-text mb-1">{t('artistForm.fields.careerYears')}</span>
                        <div className="flex items-center gap-2">
                            <div className="flex-1">
                                <YearSelect value={formData.debutYear} onChange={updateDebutYear} placeholder={t('artistForm.fields.debut')} />
                            </div>
                            <div className="flex-1">
                                {showInactive ? (
                                    <YearSelect value={formData.inactiveYear} onChange={updateInactiveYear} placeholder={t('artistForm.fields.inactive')} />
                                ) : (
                                    <div className="h-full flex items-center justify-center">
                                        <span className="px-3 py-1 text-sm font-medium text-text-secondary bg-surface-muted rounded-full">{t('artistForm.fields.present')}</span>
                                    </div>
                                )}
                            </div>
                            <IconButton
                                aria-label={showInactive ? t('artistForm.buttons.setActive') : t('artistForm.buttons.setInactive')}
                                onClick={() => { setShowInactive(!showInactive); if (showInactive) updateInactiveYear(undefined); }}
                                title={showInactive ? t('artistForm.buttons.setActive') : t('artistForm.buttons.setInactive')}
                            >
                                {showInactive ? <MusicNoteIcon /> : <SleepIcon />}
                            </IconButton>
                        </div>
                    </div>

                    {/* Social Media section */}
                    <div>
                        <button
                            aria-expanded={isSocialExpanded}  
                            onClick={() => setIsSocialExpanded(!isSocialExpanded)}
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
                        onClick={onCancel}
                        disabled={isSaving}
                        variant="secondary"
                        className="flex-1"
                        type="button"
                    >
                        {t('artistForm.buttons.cancel')}
                    </Button>
                    <Button
                        onClick={handleSave}
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
