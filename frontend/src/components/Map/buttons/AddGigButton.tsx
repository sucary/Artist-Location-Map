import { PlusIcon } from '../../icons/GeneralIcons';
import { useTranslation } from 'react-i18next';

interface AddGigButtonProps {
    onClick: () => void;
}

const AddGigButton = ({ onClick }: AddGigButtonProps) => {
    const { t } = useTranslation();

    return (
        <div className="absolute top-28 right-2 z-[1000]">
            <button
                aria-label={t('tour.actions.addGig')}
                onClick={onClick}
                className="group flex h-12 w-12 items-center justify-center rounded-full bg-primary-contrast text-white shadow-md transition-colors hover:bg-primary-contrast-hover active:bg-primary"
                title={t('tour.actions.addGig')}
            >
                <PlusIcon className="h-6 w-6 transition-transform duration-200 ease-out group-hover:rotate-90 group-hover:scale-110 group-active:scale-95" />
            </button>
        </div>
    );
};

export default AddGigButton;
