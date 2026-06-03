import { CalendarIcon } from '../../icons/GeneralIcons';
import { useTranslation } from 'react-i18next';

// Gig calendar map control

interface ViewGigCalendarButtonProps {
    onClick: () => void;
}

const ViewGigCalendarButton = ({ onClick }: ViewGigCalendarButtonProps) => {
    const { t } = useTranslation();

    return (
        <div className="absolute top-60 right-2 z-[1000]">
            <button
                aria-label={t('tour.actions.viewCalendar')}
                onClick={onClick}
                className="bg-surface p-3 rounded-md shadow-md hover:bg-primary hover:text-white active:bg-primary active:text-white transition-colors text-text"
                title={t('tour.actions.viewCalendar')}
            >
                <CalendarIcon className="w-6 h-6" />
            </button>
        </div>
    );
};

export default ViewGigCalendarButton;
