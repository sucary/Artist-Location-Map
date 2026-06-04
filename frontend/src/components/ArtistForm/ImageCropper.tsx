import { useState, useCallback, useRef, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import type { CropArea } from '../../types/artist';
import { ASPECT_RATIOS } from '../../constants/artist';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import { useTranslation } from 'react-i18next';

// Image cropper dialog with avatar and profile crop controls

export interface CropResult {
    avatarCrop: CropArea;
    profileCrop: CropArea;
}

interface ImageCropperProps {
    imageSrc: string; // Source image URL to be cropped
    initialAvatarCrop?: CropArea;
    initialProfileCrop?: CropArea;
    initialMode?: CropMode;
    onSave: (result: CropResult) => void;
    onCancel: () => void;
    onReupload?: () => void;
}

type CropMode = 'avatar' | 'profile';

interface CropState {
    crop: Point;
    zoom: number;
}

const areaToCropArea = (area: Area): CropArea => ({
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
});

const getCenteredCrop = (imageWidth: number, imageHeight: number, aspect: number): CropArea => {
    const imageAspect = imageWidth / imageHeight;
    const width = imageAspect > aspect ? imageHeight * aspect : imageWidth;
    const height = imageAspect > aspect ? imageHeight : imageWidth / aspect;

    return {
        x: Math.max(0, (imageWidth - width) / 2),
        y: Math.max(0, (imageHeight - height) / 2),
        width,
        height,
    };
};

const INITIAL_CROP_STATE: CropState = {
    crop: { x: 0, y: 0 },
    zoom: 1,
};

const ImageCropper = ({
    imageSrc,
    initialAvatarCrop,
    initialProfileCrop,
    initialMode = 'avatar',
    onSave,
    onCancel,
    onReupload
}: ImageCropperProps) => {
    const dialogRef = useDialogAccessibility(onCancel);
    const [mode, setMode] = useState<CropMode>(initialMode);
    const { t } = useTranslation();
    const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

    // Single crop state - resets when switching tabs
    const [cropState, setCropState] = useState<CropState>({ ...INITIAL_CROP_STATE });

    // Track which crops have been captured (saved when user interacts with that tab)
    const [avatarCroppedArea, setAvatarCroppedArea] = useState<Area | null>(null);
    const [profileCroppedArea, setProfileCroppedArea] = useState<Area | null>(null);

    // Switch tab and reset crop state
    const switchMode = useCallback((newMode: CropMode) => {
        if (newMode !== mode) {
            setMode(newMode);
            setCropState({ ...INITIAL_CROP_STATE });
        }
    }, [mode]);

    const onCropChange = useCallback((location: Point) => {
        setCropState(prev => ({ ...prev, crop: location }));
    }, []);

    const onZoomChange = useCallback((newZoom: number) => {
        setCropState(prev => ({ ...prev, zoom: newZoom }));
    }, []);

    const onCropAreaComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
        // Save to the appropriate crop area
        if (mode === 'avatar') {
            setAvatarCroppedArea(croppedAreaPixels);
        } else {
            setProfileCroppedArea(croppedAreaPixels);
        }
    }, [mode]);

    const handleReset = useCallback(() => {
        setCropState({ ...INITIAL_CROP_STATE });
    }, []);

    // Wheel zoom with non-passive listener to allow preventDefault
    const cropAreaRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const element = cropAreaRef.current;
        if (!element) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const delta = -e.deltaY * 0.001;
            setCropState(prev => ({
                ...prev,
                zoom: Math.min(3, Math.max(1, prev.zoom + delta))
            }));
        };

        element.addEventListener('wheel', handleWheel, { passive: false });
        return () => element.removeEventListener('wheel', handleWheel);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const image = new Image();
        image.onload = () => {
            if (cancelled) return;
            setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
        };
        image.src = imageSrc;

        return () => {
            cancelled = true;
        };
    }, [imageSrc]);

    const handleSave = useCallback(() => {
        const avatarCrop = avatarCroppedArea
            ? areaToCropArea(avatarCroppedArea)
            : initialAvatarCrop || (imageSize
                ? getCenteredCrop(imageSize.width, imageSize.height, ASPECT_RATIOS.avatar)
                : { x: 0, y: 0, width: 400, height: 400 });

        const profileCrop = profileCroppedArea
            ? areaToCropArea(profileCroppedArea)
            : initialProfileCrop || (imageSize
                ? getCenteredCrop(imageSize.width, imageSize.height, ASPECT_RATIOS.profile)
                : { x: 0, y: 0, width: 800, height: 320 });

        onSave({ avatarCrop, profileCrop });
    }, [avatarCroppedArea, profileCroppedArea, imageSize, initialAvatarCrop, initialProfileCrop, onSave]);

    // Check if either crop has been modified
    const hasChanges = avatarCroppedArea !== null || profileCroppedArea !== null;

    return (
        <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('artistForm.cropper.title')}
            tabIndex={-1}
            className="fixed inset-0 z-cropper flex items-center justify-center bg-black/70 focus:outline-none">
            <div className="bg-surface rounded-lg shadow-xl w-[90vw] max-w-md overflow-hidden">
                {/* Tabs */}
                <div className="grid grid-cols-2 gap-2 border-b border-border bg-surface px-3 py-2">
                    <button
                        aria-selected={mode === 'avatar'}
                        type="button"
                        onClick={() => switchMode('avatar')}
                        className={`rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                            mode === 'avatar'
                                ? 'bg-primary-contrast text-white shadow-sm'
                                : 'text-text-secondary hover:bg-surface-muted hover:text-text'
                        }`}
                    >
                        {t('artistForm.cropper.avatar')}
                    </button>
                    <button
                        aria-selected={mode === 'profile'}
                        type="button"
                        onClick={() => switchMode('profile')}
                        className={`rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                            mode === 'profile'
                                ? 'bg-primary-contrast text-white shadow-sm'
                                : 'text-text-secondary hover:bg-surface-muted hover:text-text'
                        }`}
                    >
                        {t('artistForm.cropper.banner')}
                    </button>
                </div>

                {/* Crop area */}
                <div ref={cropAreaRef} className="relative h-80 bg-black">
                    {/* Re-upload button */}
                    {onReupload && (
                        <button
                            aria-label={t('artistForm.cropper.reUpload')}
                            onClick={onReupload}
                            className="absolute left-3 top-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-white/80 bg-black/40 hover:bg-black/60 hover:text-white transition-colors"
                            type="button"
                            title={t('artistForm.cropper.reUpload')}
                        >
                            <svg 
                            aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            {t('artistForm.cropper.reUpload')}
                        </button>
                    )}

                    <Cropper
                        image={imageSrc}
                        crop={cropState.crop}
                        zoom={cropState.zoom}
                        aspect={ASPECT_RATIOS[mode]}
                        cropShape={mode === 'avatar' ? 'round' : 'rect'}
                        showGrid={mode === 'profile'}
                        onCropChange={onCropChange}
                        onZoomChange={onZoomChange}
                        onCropComplete={onCropAreaComplete}
                        zoomSpeed={0.1}
                        style={{
                            containerStyle: { backgroundColor: '#000' },
                            mediaStyle: { backgroundColor: '#000' },
                        }}
                    />

                    {/* Right side controls */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 pointer-events-auto">
                        <svg 
                        aria-hidden="true" className="w-3.5 h-3.5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        <input
                            aria-label={t('artistForm.cropper.zoom')}
                            type="range"
                            min={1}
                            max={3}
                            step={0.01}
                            value={cropState.zoom}
                            onChange={(e) => onZoomChange(Number(e.target.value))}
                            className="cropper-zoom-slider cursor-pointer"
                            style={{
                                writingMode: 'vertical-lr',
                                direction: 'rtl',
                                width: '4px',
                                height: '100px',
                            }}
                        />
                        <svg aria-hidden="true" className="w-3.5 h-3.5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                        </svg>
                        <button
                            onClick={handleReset}
                            className="mt-1 px-2 py-0.5 rounded text-[10px] font-medium text-white/60 hover:text-white/90 hover:bg-surface/10 transition-colors"
                            type="button"
                            title={t('artistForm.cropper.resetToDefault')}
                            aria-label={t('artistForm.cropper.resetToDefault')}
                        >
                            {t('artistForm.cropper.reset')}
                        </button>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 p-4 border-t border-border">
                    <button
                        onClick={onCancel}
                        className="flex-1 rounded-md border border-transparent bg-[#F3F4F6] px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-[#E5E7EB] app-dark:bg-[#2C2C2E] app-dark:text-text app-dark:hover:bg-[#3A3A3C]"
                        type="button"
                    >
                        {t('artistForm.buttons.cancel')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!hasChanges}
                        className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-contrast border border-transparent rounded-md hover:bg-primary-contrast-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        type="button"
                    >
                        {t('artistForm.buttons.save')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ImageCropper;
