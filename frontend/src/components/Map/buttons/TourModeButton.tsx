import { CalendarIcon } from '../../icons/GeneralIcons';
import { useTranslation } from 'react-i18next';

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
            <CalendarIcon className="h-6 w-6" />
        </button>
    );
};

export default TourModeButton;
