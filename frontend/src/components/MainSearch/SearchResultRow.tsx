import type { ArtistSearchResult, UserSearchResult, SearchResult } from '../../types/search';
import { formatLocationLocalized } from '../../utils/locationUtils';
import { UserIcon } from '../icons/GeneralIcons';
import { useLocationLanguage } from '../../context/LocationLanguageContext';
import { getAvatarUrl } from '../../utils/cloudinaryUrl';
import { useTranslation } from 'react-i18next';

interface SearchResultRowProps {
    result: SearchResult;
    onSelect: () => void;
}

const getPlaceholderUrl = (name: string) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=80&background=e5e7eb&color=9ca3af`;

function ArtistRow({ result, onSelect }: { result: ArtistSearchResult; onSelect: () => void }) {
    const { locationLanguage } = useLocationLanguage();
    const artist = result.artist;

    return (
        <button
            role="option"
            aria-selected="false"
            onClick={onSelect}
            className="flex w-full text-left items-center gap-3 px-4 py-3 hover:bg-surface-muted transition-colors cursor-pointer"
        >
            <img
                src={getAvatarUrl(artist.sourceImage, artist.avatarCrop) || getPlaceholderUrl(artist.name)}
                alt=""
                className="w-9 h-9 rounded-full object-cover border border-border"
            />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text truncate">{artist.name}</p>
                {artist.romanizedName && artist.romanizedName !== artist.name && (
                    <p className="text-xs text-text-secondary truncate">{artist.romanizedName}</p>
                )}
                <p className="text-xs text-text-secondary truncate">
                    {formatLocationLocalized(artist.activeLocation, locationLanguage)}
                </p>
            </div>
        </button>
    );
}

function UserRow({ result, onSelect }: { result: UserSearchResult; onSelect: () => void }) {
    const { t } = useTranslation();
    return (
        <button
            role="option"
            aria-selected="false"
            onClick={onSelect}
            className="flex w-full text-left items-center gap-3 px-4 py-3 hover:bg-surface-muted transition-colors cursor-pointer"
        >
            <div className="w-8 h-10 flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text truncate">{result.username}</p>
                <span className="text-xs text-text-secondary">{t('mainSearch.viewMap')}</span>
            </div>
        </button>
    );
}

export function SearchResultRow({ result, onSelect }: SearchResultRowProps) {
    switch (result.type) {
        case 'artist':
            return <ArtistRow result={result} onSelect={onSelect} />;
        case 'user':
            return <UserRow result={result} onSelect={onSelect} />;
    }
}
