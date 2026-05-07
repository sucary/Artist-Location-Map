import { ListIcon } from '../../icons/GeneralIcons';

interface ViewArtistListButtonProps {
    onClick: () => void;
}

const ViewArtistListButton = ({ onClick }: ViewArtistListButtonProps) => {
    return (
        <div className="absolute top-44 right-2 z-[1000]">
            <button
                aria-label="View Artist List"
                onClick={onClick}
                className="bg-surface p-3 rounded-md shadow-md hover:bg-primary hover:text-white active:bg-primary active:text-white transition-colors text-text"
                title="View Artist List"
            >
                <ListIcon className="w-6 h-6" />
            </button>
        </div>
    );
};

export default ViewArtistListButton;
