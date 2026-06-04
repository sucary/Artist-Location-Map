import { TourModeIcon } from '../../icons/GeneralIcons';
import { useTranslation } from 'react-i18next';

// Tour mode map control

interface TourModeButtonProps {
    active: boolean;
    onClick: () => void;
}

const TourModeButton = ({ active, onClick }: TourModeButtonProps) => {
    const { t } = useTranslation();

    return (
        <button
            aria-pressed={active}
            aria-label={active ? t('tour.actions.exitTourMode') : t('tour.actions.enterTourMode')}
            onClick={onClick}
            className={`h-12 w-12 shrink-0 flex items-center justify-center rounded-md border shadow-md transition-colors focus:outline-none ${
                active
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-surface text-text hover:border-primary hover:bg-primary hover:text-white'
            }`}
            title={active ? t('tour.actions.exitTourMode') : t('tour.actions.enterTourMode')}
        >
            {active ? (
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
            ) : (
                <TourModeIcon className="h-6 w-6" />
            )}
        </button>
    );
};

export default TourModeButton;
