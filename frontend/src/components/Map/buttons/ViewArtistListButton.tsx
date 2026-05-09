import { ListIcon } from '../../icons/GeneralIcons';
import { useTranslation } from 'react-i18next';

interface ViewArtistListButtonProps {
    onClick: () => void;
}

const ViewArtistListButton = ({ onClick }: ViewArtistListButtonProps) => {
    const { t } = useTranslation();
    return (
        <div className="absolute top-44 right-2 z-[1000]">
            <button
                aria-label={t('map.buttons.viewArtistList')}
                onClick={onClick}
                className="bg-surface p-3 rounded-md shadow-md hover:bg-primary hover:text-white active:bg-primary active:text-white transition-colors text-text"
                title={t('map.buttons.viewArtistList')}
            >
                <ListIcon className="w-6 h-6" />
            </button>
        </div>
    );
};

export default ViewArtistListButton;
