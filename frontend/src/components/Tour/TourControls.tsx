import { useEffect, useState } from 'react';
import type { TourModeState } from '../../types/gig';
import { TourDateRangePicker } from './TourDateRangePicker';

interface TourControlsProps {
    tourMode: TourModeState;
    onIntervalChange: (from: string, to: string) => void;
    onReset: () => void;
}

export function TourControls({
    tourMode,
    onIntervalChange,
    onReset,
}: TourControlsProps) {
    const [draftFrom, setDraftFrom] = useState(tourMode.interval?.from ?? '');
    const [draftTo, setDraftTo] = useState(tourMode.interval?.to ?? '');

    useEffect(() => {
        setDraftFrom(tourMode.interval?.from ?? '');
        setDraftTo(tourMode.interval?.to ?? '');
    }, [tourMode.interval?.from, tourMode.interval?.to]);

    const handleRangeChange = (from: string, to: string) => {
        setDraftFrom(from);
        setDraftTo(to);
        if (!from || !to) return;
        onIntervalChange(from, to);
    };

    return (
        <div className="flex items-center gap-2">
            <TourDateRangePicker
                from={draftFrom}
                to={draftTo}
                onChange={handleRangeChange}
                onReset={onReset}
            />
        </div>
    );
}
