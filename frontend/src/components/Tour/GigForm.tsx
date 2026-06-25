import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { getArtists, getTours } from '../../services/api';
import type { Artist, Coordinates, Location, SelectionMode } from '../../types/artist';
import type { Gig, GigInput } from '../../types/gig';
import { Button, CloseButton } from '../ui';
import { VenueLocationSearch } from './VenueLocationSearch';
import { ArtistMultiSelect } from './ArtistMultiSelect';
import { TourSelect } from './TourSelect';
import { GigDatePicker, parseDateValue } from './GigDatePicker';
import { GigTimePicker } from './GigTimePicker';
import { useTranslation } from 'react-i18next';

interface GigFormProps {
    initialGig?: Gig | null;
    initialArtist?: Artist | null;
    initialArtistId?: string;
    initialTourId?: string;
    initialDate?: string;
    onSubmit: (input: GigInput, id?: string) => Promise<void> | void;
    onCancel: () => void;
    onRequestSelection?: (targetField: SelectionMode['targetField']) => void;
    pendingCoordinates?: Coordinates | null;
    onConsumePendingCoordinates?: () => void;
}

// API validation response shape
type ApiValidationError = {
    errors?: Array<{
        field?: string;
        message?: string;
    }>;
    message?: string;
};

function getSubmitErrorMessage(error: unknown, fallback: string): string {
    if (!axios.isAxiosError<ApiValidationError>(error)) return fallback;

    const data = error.response?.data;
    const validationMessages = data?.errors
        ?.map((issue) => [issue.field, issue.message].filter(Boolean).join(': '))
        .filter(Boolean);

    return validationMessages?.length ? validationMessages.join('\n') : data?.message || fallback;
}

function formatMissingFieldList(fields: string[], locale?: string): string {
    if (typeof Intl.ListFormat === 'undefined') return fields.join(', ');
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(fields);
}

export function GigForm({
    initialGig,
    initialArtist,
    initialArtistId,
    initialTourId,
    initialDate = '',
    onSubmit,
    onCancel,
    onRequestSelection,
    pendingCoordinates,
    onConsumePendingCoordinates,
}: GigFormProps) {
    const { i18n, t } = useTranslation();
    const { data: artists = [] } = useQuery({
        queryKey: ['artists'],
        queryFn: () => getArtists(),
    });
    const { data: tours = [], isFetched: toursFetched } = useQuery({
        queryKey: ['tours'],
        queryFn: getTours,
    });
    const initialArtistSeedId = initialArtist?.id ?? initialArtistId;
    const initialSelectedArtistIds = initialGig?.artistIds ?? (initialArtistSeedId ? [initialArtistSeedId] : []);
    const initialSelectedTourId = initialGig?.tourId ?? initialTourId ?? '';
    const [artistIds, setArtistIds] = useState<string[]>(initialSelectedArtistIds);
    const [tourMode, setTourMode] = useState<'none' | 'existing' | 'new'>(initialSelectedTourId ? 'existing' : 'none');
    const [tourId, setTourId] = useState(initialSelectedTourId);
    const [newTourName, setNewTourName] = useState('');
    const [gigName, setGigName] = useState(initialGig?.gigName ?? '');
    const [date, setDate] = useState(initialGig?.date ?? initialDate);
    const [time, setTime] = useState(initialGig?.time ?? '');
    const [location, setLocation] = useState<Location | null>(initialGig?.location ?? null);
    const [venueName, setVenueName] = useState<string | null>(initialGig?.venueName ?? null);
    const [placeLocationId, setPlaceLocationId] = useState<string | null>(initialGig?.placeLocationId ?? null);
    const [rawExternalData, setRawExternalData] = useState<unknown>(initialGig?.rawExternalData ?? undefined);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const hasTours = tours.length > 0;

    useEffect(() => {
        const nextArtistIds = initialGig?.artistIds ?? (initialArtistSeedId ? [initialArtistSeedId] : []);
        const nextTourId = initialGig?.tourId ?? initialTourId ?? '';

        setArtistIds(nextArtistIds);
        setTourMode(nextTourId ? 'existing' : 'none');
        setTourId(nextTourId);
        setNewTourName('');
        setGigName(initialGig?.gigName ?? '');
        setDate(initialGig?.date ?? initialDate);
        setTime(initialGig?.time ?? '');
        setLocation(initialGig?.location ?? null);
        setVenueName(initialGig?.venueName ?? null);
        setPlaceLocationId(initialGig?.placeLocationId ?? null);
        setRawExternalData(initialGig?.rawExternalData ?? undefined);
        setError(null);
    }, [initialArtistSeedId, initialDate, initialGig, initialTourId]);

    useEffect(() => {
        if (!toursFetched || hasTours || tourMode === 'new') return;

        // Existing-tour mode is unavailable without selectable tours
        setTourMode('new');
        setTourId('');
    }, [hasTours, tourMode, toursFetched]);

    const selectedArtistNames = useMemo(() => (
        artistIds
            .map((artistId) => artists.find((artist) => artist.id === artistId)?.name)
            .filter((name): name is string => !!name)
            .join(', ')
    ), [artistIds, artists]);
    const hasTourAssignment = tourMode !== 'none';

    const handleLocationChange = useCallback((value: {
        venueName?: string | null;
        placeLocationId?: string | null;
        location: Location | null;
        rawExternalData?: unknown;
    }) => {
        setVenueName(value.venueName ?? null);
        setPlaceLocationId(value.placeLocationId ?? null);
        setLocation(value.location);
        setRawExternalData(value.rawExternalData);
    }, []);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError(null);

        const missingDate = !parseDateValue(date);

        if (artistIds.length === 0 || missingDate || !location) {
            const missingFields = [
                artistIds.length === 0 ? t('tour.fields.artists') : null,
                missingDate ? t('tour.fields.date') : null,
                !location ? t('tour.fields.venueLocation') : null,
            ].filter((field): field is string => !!field);

            setError(t('tour.errors.missingRequiredFields', {
                defaultValue: 'Please add {{fields}}',
                fields: formatMissingFieldList(missingFields, i18n.resolvedLanguage || i18n.language || undefined),
            }));
            return;
        }

        setIsSaving(true);
        try {
            // Persisted gig locations keep their selected city identity
            const submitLocation = location && initialGig?.locationCityId && !location.cityId
                ? { ...location, cityId: initialGig.locationCityId }
                : location;

            await onSubmit({
                artistIds,
                tourId: tourMode === 'existing' && tourId ? tourId : null,
                newTourName: tourMode === 'new' && newTourName.trim() ? newTourName.trim() : undefined,
                gigName: hasTourAssignment ? null : gigName.trim() || null,
                venueName: venueName?.trim() || null,
                placeLocationId,
                location: submitLocation,
                date,
                time: time || null,
                rawExternalData: venueName ? rawExternalData : null,
            }, initialGig?.id);
        } catch (submitError) {
            setError(getSubmitErrorMessage(submitError, t('tour.errors.saveFailed', { defaultValue: 'Failed to save gig' })));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form
            onSubmit={(event) => { void handleSubmit(event); }}
            className="absolute top-20 left-1/2 z-[1050] flex max-h-[calc(100vh-6rem)] w-[calc(100vw-1rem)] max-w-sm -translate-x-1/2 flex-col overflow-hidden rounded-xl bg-surface font-sans shadow-xl shadow-black/5 ring-1 ring-border/40 sm:top-28 sm:right-2 sm:left-auto sm:max-h-[calc(100vh-8rem)] sm:translate-x-0"
        >
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
                <h2 className="text-base font-semibold tracking-tight text-text">
                    {initialGig ? t('tour.form.editTitle') : t('tour.form.addTitle')}
                </h2>
                <CloseButton onClick={onCancel} size="md" />
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="flex flex-col gap-4 p-4">
                    {/* Artists section */}
                    <div>
                        <ArtistMultiSelect
                            artists={artists}
                            value={artistIds}
                            label={t('tour.fields.artists')}
                            placeholder={t('tour.form.addArtistToGig')}
                            removeLabel={(name) => t('tour.form.removeArtist', { name })}
                            onChange={setArtistIds}
                        />
                        {selectedArtistNames && initialArtist && !initialGig && (
                            <p className="mx-1 mt-1 text-xs text-text-secondary">
                                {t('tour.form.preselectedArtist', { name: selectedArtistNames })}
                            </p>
                        )}
                    </div>

                    {/* Schedule fields */}
                    <div className="grid grid-cols-[minmax(0,1fr)_8.75rem] gap-3">
                        <GigDatePicker
                            id="gig-date"
                            label={t('tour.fields.date')}
                            value={date}
                            onChange={setDate}
                        />
                        <GigTimePicker
                            id="gig-time"
                            label={t('tour.fields.time')}
                            value={time}
                            onChange={setTime}
                        />
                    </div>

                    {/* Location section */}
                    <div>
                        <VenueLocationSearch
                            venueName={venueName}
                            placeLocationId={placeLocationId}
                            location={location}
                            rawExternalData={rawExternalData}
                            pendingCoordinates={pendingCoordinates}
                            onManualPin={onRequestSelection ? () => onRequestSelection('gigLocation') : undefined}
                            onConsumePendingCoordinates={onConsumePendingCoordinates}
                            onChange={handleLocationChange}
                        />
                    </div>

                    {/* Optional divider */}
                    <div className="flex items-center gap-2">
                        <span className="h-px flex-1 bg-border/60" />
                        <span className="text-[10px] font-medium uppercase tracking-widest text-text-muted">{t('common.optional')}</span>
                        <span className="h-px flex-1 bg-border/60" />
                    </div>

                    {/* Add to tour */}
                    <div>
                        <label
                            className="flex cursor-pointer items-center justify-between gap-3 transition-colors duration-150 hover:bg-surface-secondary/40"
                        >
                            <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                                {t('tour.fields.addToTour')}
                            </span>
                            <span className="relative inline-flex h-6 w-9 shrink-0 items-center">
                                <input
                                    type="checkbox"
                                    role="switch"
                                    checked={hasTourAssignment}
                                    onChange={(event) => {
                                        if (event.target.checked) {
                                            setTourMode(hasTours ? 'existing' : 'new');
                                            setGigName('');
                                        } else {
                                            setTourMode('none');
                                            setTourId('');
                                            setNewTourName('');
                                        }
                                    }}
                                    className="sr-only"
                                />
                                <span className={`absolute left-1 top-1/2 h-3 w-7 -translate-y-1/2 rounded-full transition-colors duration-200 ${hasTourAssignment ? 'bg-primary/35' : 'bg-border-strong'}`} />
                                <span className={`relative h-5 w-5 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-all duration-200 ${hasTourAssignment ? 'translate-x-4 bg-primary' : 'translate-x-0 bg-white app-dark:bg-text-secondary'}`} />
                            </span>
                        </label>

                        {!hasTourAssignment && (
                            <div className="mt-3">
                                <label htmlFor="gig-name" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                                    {t('tour.fields.gigName')}
                                </label>
                                <input
                                    id="gig-name"
                                    type="text"
                                    autoComplete="off"
                                    value={gigName}
                                    maxLength={255}
                                    onChange={(event) => setGigName(event.target.value)}
                                    placeholder={t('tour.form.gigNamePlaceholder')}
                                    className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary"
                                />
                            </div>
                        )}

                        {hasTourAssignment && (
                            <div className="mt-3">
                                {hasTours && (
                                    <div className="relative mb-3 inline-grid grid-cols-2 rounded-full transition-colors duration-150 hover:bg-surface-muted">
                                        <span
                                            aria-hidden="true"
                                            className={`absolute inset-y-0 z-0 w-1/2 rounded-full bg-primary-contrast shadow-sm transition-transform duration-200 ease-out ${tourMode === 'new' ? 'translate-x-full' : 'translate-x-0'}`}
                                        />
                                        <button
                                            type="button"
                                            aria-selected={tourMode === 'existing'}
                                            onClick={() => setTourMode('existing')}
                                            className={`relative z-10 rounded-full px-3 py-2 text-center text-xs font-medium transition-colors duration-150 ${
                                                tourMode === 'existing'
                                                    ? 'text-white'
                                                    : 'text-text-secondary hover:text-text'
                                            }`}
                                        >
                                            {t('tour.form.addToExistingTour')}
                                        </button>
                                        <button
                                            type="button"
                                            aria-selected={tourMode === 'new'}
                                            onClick={() => {
                                                setTourMode('new');
                                                setTourId('');
                                            }}
                                            className={`relative z-10 rounded-full px-3 py-2 text-center text-xs font-medium transition-colors duration-150 ${
                                                tourMode === 'new'
                                                    ? 'text-white'
                                                    : 'text-text-secondary hover:text-text'
                                            }`}
                                        >
                                            {t('tour.form.createATour')}
                                        </button>
                                    </div>
                                )}
                                {hasTours && tourMode === 'existing' && (
                                    <TourSelect
                                        ariaLabel={t('tour.form.addToExistingTour')}
                                        placeholder={t('tour.form.selectTour')}
                                        tours={tours}
                                        value={tourId}
                                        onChange={setTourId}
                                    />
                                )}
                                {tourMode === 'new' && (
                                    <input
                                        aria-label={t('tour.form.createATour')}
                                        type="text"
                                        autoComplete="off"
                                        placeholder={t('tour.form.tourNamePlaceholder')}
                                        value={newTourName}
                                        maxLength={255}
                                        onChange={(event) => setNewTourName(event.target.value)}
                                        className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary"
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {error && (
                    <div role="alert" className="mx-4 mb-3 rounded-lg border-l-2 border-error bg-error/5 px-3 py-2">
                        <p className="whitespace-pre-line text-sm font-medium text-error">
                            {error}
                        </p>
                    </div>
                )}
            </div>

            <div className="flex gap-3 border-t border-border/60 px-4 py-4">
                <Button type="button" variant="secondary" className="flex-1 rounded-lg" onClick={onCancel}>
                    {t('common.cancel')}
                </Button>
                <Button type="submit" className="flex-1 rounded-lg" isLoading={isSaving}>
                    {t('common.save')}
                </Button>
            </div>
        </form>
    );
}
