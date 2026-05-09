import { PlusIcon } from '../../icons/GeneralIcons';
import { useTranslation } from 'react-i18next';

interface AddArtistButtonProps {
    onClick: () => void;
}

const AddArtistButton = ({ onClick }: AddArtistButtonProps) => {
    const { t } = useTranslation();
    return (
        <div className="absolute top-28 right-2 z-[1000]">
            <button
                data-tutorial-target="add-artist-button"
                aria-label={t('map.buttons.addNewArtist')}
                onClick={onClick}
                className="bg-surface p-3 rounded-md shadow-md hover:bg-primary hover:text-white active:bg-primary active:text-white transition-colors text-text"
                title={t('map.buttons.addNewArtist')}
            >
                <PlusIcon className="h-6 w-6" />
            </button>
        </div>
    );
};

export default AddArtistButton;
