import { useEffect, useState } from 'react';
import type { TourModeState } from '../../types/gig';
import { Button, Input } from '../ui';
import { useTranslation } from 'react-i18next';

interface TourControlsProps {
    tourMode: TourModeState;
    onIntervalChange: (from: string, to: string) => void;
    onDayChange: (day: string | null) => void;
    onClearInterval: () => void;
}

export function TourControls({
    tourMode,
    onIntervalChange,
    onDayChange,
    onClearInterval,
}: TourControlsProps) {
    const { t } = useTranslation();
    const [draftFrom, setDraftFrom] = useState(tourMode.interval?.from ?? '');
    const [draftTo, setDraftTo] = useState(tourMode.interval?.to ?? '');

    useEffect(() => {
        setDraftFrom(tourMode.interval?.from ?? '');
        setDraftTo(tourMode.interval?.to ?? '');
    }, [tourMode.interval?.from, tourMode.interval?.to]);

    const handleFromChange = (value: string) => {
        setDraftFrom(value);
        if (!value || !draftTo) return;
        onIntervalChange(value, draftTo);
    };

    const handleToChange = (value: string) => {
        setDraftTo(value);
        if (!draftFrom || !value) return;
        onIntervalChange(draftFrom, value);
    };

    return (
        <div className="absolute left-2 top-20 z-[1050] w-[calc(100vw-1rem)] max-w-xl rounded-lg border border-border bg-surface p-3 shadow-xl sm:top-20 sm:w-auto">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_9rem_9rem_auto] sm:items-end">
                <Input
                    type="date"
                    label={t('tour.fields.from')}
                    value={draftFrom}
                    onChange={(event) => handleFromChange(event.target.value)}
                />
                <Input
                    type="date"
                    label={t('tour.fields.to')}
                    value={draftTo}
                    onChange={(event) => handleToChange(event.target.value)}
                />
                <Input
                    type="date"
                    label={t('tour.fields.highlightDay')}
                    value={tourMode.selectedDay ?? ''}
                    onChange={(event) => onDayChange(event.target.value || null)}
                    disabled={!tourMode.interval}
                />
                <Button type="button" variant="secondary" onClick={onClearInterval}>
                    {t('tour.actions.clearDates')}
                </Button>
            </div>
        </div>
    );
}
