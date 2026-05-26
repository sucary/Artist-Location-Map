import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getArtists, getTours } from '../../services/api';
import type { Artist, Location } from '../../types/artist';
import type { Gig, GigInput } from '../../types/gig';
import { Button, CloseButton } from '../ui';
import { VenueLocationSearch } from './VenueLocationSearch';
import { ArtistMultiSelect } from './ArtistMultiSelect';
import { TourSelect } from './TourSelect';
import { useTranslation } from 'react-i18next';

interface GigFormProps {
    initialGig?: Gig | null;
    initialArtist?: Artist | null;
    onSubmit: (input: GigInput, id?: string) => Promise<void> | void;
    onCancel: () => void;
}

export function GigForm({
    initialGig,
    initialArtist,
    onSubmit,
    onCancel,
}: GigFormProps) {
    const { t } = useTranslation();
    const { data: artists = [] } = useQuery({
        queryKey: ['artists'],
        queryFn: () => getArtists(),
    });
    const { data: tours = [], isFetched: toursFetched } = useQuery({
        queryKey: ['tours'],
        queryFn: getTours,
    });
    const [artistIds, setArtistIds] = useState<string[]>(initialGig?.artistIds ?? (initialArtist ? [initialArtist.id] : []));
    const [isAddingToTour, setIsAddingToTour] = useState(() => !!initialGig?.tourId);
    const [tourMode, setTourMode] = useState<'none' | 'existing' | 'new'>(initialGig?.tourId ? 'existing' : 'none');
    const [tourId, setTourId] = useState(initialGig?.tourId ?? '');
    const [newTourName, setNewTourName] = useState('');
    const [gigName, setGigName] = useState(initialGig?.gigName ?? '');
    const [date, setDate] = useState(initialGig?.date ?? '');
    const [location, setLocation] = useState<Location | null>(initialGig?.location ?? null);
    const [venueName, setVenueName] = useState<string | null>(initialGig?.venueName ?? null);
    const [placeLocationId, setPlaceLocationId] = useState<string | null>(initialGig?.placeLocationId ?? null);
    const [rawExternalData, setRawExternalData] = useState<unknown>(initialGig?.rawExternalData ?? undefined);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const hasTours = tours.length > 0;

    useEffect(() => {
        setArtistIds(initialGig?.artistIds ?? (initialArtist ? [initialArtist.id] : []));
        setIsAddingToTour(!!initialGig?.tourId);
        setTourMode(initialGig?.tourId ? 'existing' : 'none');
        setTourId(initialGig?.tourId ?? '');
        setNewTourName('');
        setGigName(initialGig?.gigName ?? '');
        setDate(initialGig?.date ?? '');
        setLocation(initialGig?.location ?? null);
        setVenueName(initialGig?.venueName ?? null);
        setPlaceLocationId(initialGig?.placeLocationId ?? null);
        setRawExternalData(initialGig?.rawExternalData ?? undefined);
        setError(null);
    }, [initialArtist?.id, initialGig]);

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

    const toggleTourExpanded = () => {
        const nextAddingToTour = !isAddingToTour;
        setIsAddingToTour(nextAddingToTour);

        if (nextAddingToTour) {
            setTourMode(hasTours ? 'existing' : 'new');
            return;
        }

        setTourMode('none');
        setTourId('');
        setNewTourName('');
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError(null);

        if (artistIds.length === 0 || !date || !location) {
            setError(t('tour.errors.requiredFields'));
            return;
        }

        setIsSaving(true);
        try {
            await onSubmit({
                artistIds,
                tourId: tourMode === 'existing' && tourId ? tourId : null,
                newTourName: tourMode === 'new' && newTourName.trim() ? newTourName.trim() : undefined,
                gigName: gigName.trim() || null,
                venueName: venueName?.trim() || null,
                placeLocationId,
                location,
                date,
                rawExternalData: venueName ? rawExternalData : null,
            }, initialGig?.id);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form
            onSubmit={(event) => { void handleSubmit(event); }}
            className="absolute top-20 left-1/2 z-[1050] flex max-h-[calc(100vh-6rem)] w-[calc(100vw-1rem)] max-w-80 -translate-x-1/2 flex-col overflow-hidden rounded-lg bg-surface font-sans shadow-xl sm:top-28 sm:right-2 sm:left-auto sm:w-80 sm:translate-x-0"
        >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-lg font-semibold text-text">
                    {initialGig ? t('tour.form.editTitle') : t('tour.form.addTitle')}
                </h2>
                <CloseButton onClick={onCancel} size="md" />
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="flex flex-col gap-4 p-4">
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

                    <div className="rounded-md p-1">
                        <label htmlFor="gig-date" className="mb-1 block text-sm font-bold text-text">
                            {t('tour.fields.date')}
                        </label>
                        <input
                            id="gig-date"
                            type="date"
                            value={date}
                            onChange={(event) => setDate(event.target.value)}
                            className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-left text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:ml-0 [&::-webkit-calendar-picker-indicator]:p-0 [&::-webkit-datetime-edit]:p-0 [&::-webkit-datetime-edit-fields-wrapper]:p-0"
                        />
                    </div>

                    <div className="location-search-compact">
                        <VenueLocationSearch
                            venueName={venueName}
                            location={location}
                            rawExternalData={rawExternalData}
                            onChange={(value) => {
                                setVenueName(value.venueName ?? null);
                                setPlaceLocationId(value.placeLocationId ?? null);
                                setLocation(value.location);
                                setRawExternalData(value.rawExternalData);
                            }}
                        />
                    </div>

                    <div className="rounded-md p-1">
                        <label htmlFor="gig-name" className="mb-1 block text-sm font-bold text-text">
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
                            className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary"
                        />
                    </div>

                    <div className="rounded-md p-1">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <span className="block text-sm font-bold text-text">{t('tour.fields.addToTour')}</span>
                            <label className="inline-flex items-center">
                                <span className="sr-only">{t('tour.fields.addToTour')}</span>
                                <input
                                    type="checkbox"
                                    role="switch"
                                    checked={isAddingToTour}
                                    onChange={toggleTourExpanded}
                                    className="sr-only"
                                />
                                <span className="relative inline-flex h-6 w-9 cursor-pointer items-center">
                                    <span className={`absolute left-1 top-1/2 h-3 w-7 -translate-y-1/2 rounded-full transition-colors duration-200 ${isAddingToTour ? 'bg-primary/35' : 'bg-border-strong'}`} />
                                    <span className={`relative h-5 w-5 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-colors transition-transform duration-200 ${isAddingToTour ? 'translate-x-4 bg-primary' : 'translate-x-0 bg-white app-dark:bg-text-secondary'}`} />
                                </span>
                            </label>
                        </div>

                        {isAddingToTour && (
                            <div>
                                {hasTours && (
                                    <div className="mb-3 grid grid-cols-2 overflow-hidden rounded-md bg-surface">
                                        <button
                                            type="button"
                                            aria-selected={tourMode === 'existing'}
                                            onClick={() => setTourMode('existing')}
                                            className={`px-3 py-2 text-sm font-medium transition-colors ${
                                                tourMode === 'existing'
                                                    ? 'bg-primary text-white app-dark:text-white'
                                                    : 'text-text-secondary hover:bg-surface-muted hover:text-text'
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
                                            className={`px-3 py-2 text-sm font-medium transition-colors ${
                                                tourMode === 'new'
                                                    ? 'bg-primary text-white app-dark:text-white'
                                                    : 'text-text-secondary hover:bg-surface-muted hover:text-text'
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
                                        className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 pr-8 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary"
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {error && (
                    <p role="alert" className="mx-4 mb-3 text-sm font-medium text-error app-dark:text-primary">
                        {error}
                    </p>
                )}
            </div>

            <div className="flex gap-2 border-t border-border p-4">
                <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
                    {t('common.cancel')}
                </Button>
                <Button type="submit" className="flex-1" isLoading={isSaving}>
                    {t('common.save')}
                </Button>
            </div>
        </form>
    );
}
