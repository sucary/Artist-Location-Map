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
                className="bg-surface p-3 rounded-md shadow-md hover:bg-primary hover:text-white active:bg-primary active:text-white transition-colors text-text"
                title={t('tour.actions.addGig')}
            >
                <PlusIcon className="h-6 w-6" />
            </button>
        </div>
    );
};

export default AddGigButton;
