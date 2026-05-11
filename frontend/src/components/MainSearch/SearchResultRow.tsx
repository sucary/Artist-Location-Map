import type { ArtistSearchResult, UserSearchResult, SearchResult } from '../../types/search';
import { formatLocationLocalized } from '../../utils/locationUtils';
import { UserIcon } from '../icons/GeneralIcons';
import { useLocationLanguage } from '../../context/LocationLanguageContext';
import { getAvatarUrl } from '../../utils/cloudinaryUrl';
import { useTranslation } from 'react-i18next';

interface SearchResultRowProps {
    result: SearchResult;
    onSelect: () => void;
    id?: string;
    isActive?: boolean;
    onActive?: () => void;
}

const getPlaceholderUrl = (name: string) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=80&background=e5e7eb&color=9ca3af`;

function ArtistRow({ result, onSelect, id, isActive = false, onActive }: SearchResultRowProps & { result: ArtistSearchResult }) {
    const { locationLanguage } = useLocationLanguage();
    const artist = result.artist;

    return (
        <button
            id={id}
            role="option"
            aria-selected={isActive}
            onClick={onSelect}
            onMouseEnter={onActive}
            className={`flex w-full text-left items-center gap-3 px-4 py-3 transition-colors cursor-pointer ${isActive ? 'bg-surface-muted' : 'hover:bg-surface-muted'}`}
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

function UserRow({ result, onSelect, id, isActive = false, onActive }: SearchResultRowProps & { result: UserSearchResult }) {
    const { t } = useTranslation();
    return (
        <button
            id={id}
            role="option"
            aria-selected={isActive}
            onClick={onSelect}
            onMouseEnter={onActive}
            className={`flex w-full text-left items-center gap-3 px-4 py-3 transition-colors cursor-pointer ${isActive ? 'bg-surface-muted' : 'hover:bg-surface-muted'}`}
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

export function SearchResultRow({ result, onSelect, id, isActive, onActive }: SearchResultRowProps) {
    switch (result.type) {
        case 'artist':
            return <ArtistRow result={result} onSelect={onSelect} id={id} isActive={isActive} onActive={onActive} />;
        case 'user':
            return <UserRow result={result} onSelect={onSelect} id={id} isActive={isActive} onActive={onActive} />;
    }
}
