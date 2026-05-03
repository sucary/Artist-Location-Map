import type { LocationSearchResult, UserSearchResult, SearchResult } from '../../types/search';
import { formatLocationLocalized } from '../../utils/locationUtils';
import { UserIcon } from '../icons/GeneralIcons';
import { useAuth } from '../../context/AuthContext';
import { useLocationLanguage } from '../../context/LocationLanguageContext';

interface SearchResultRowProps {
    result: SearchResult;
    onSelect: () => void;
}

function LocationRow({ result, onSelect }: { result: LocationSearchResult; onSelect: () => void }) {
    const { profile } = useAuth();
    const { locationLanguage } = useLocationLanguage();
    const displayText = result.localizedChain
        ? formatLocationLocalized({ localizedChain: result.localizedChain }, locationLanguage)
        : result.displayName;
    return (
        <button            
            role="option"
            onClick={onSelect}
            className="flex w-full text-left items-center gap-3 px-4 py-3 hover:bg-surface-muted transition-colors cursor-pointer"
        >
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text truncate">{displayText}</p>
                <div className="flex items-center gap-2 mt-0.5">
                    {result.locationType && (
                        <span className="text-xs text-text-secondary capitalize">{result.locationType}</span>
                    )}
                    {profile?.isAdmin && result.isLocal && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-secondary/10 text-secondary ml-auto">
                            DB
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
}

function UserRow({ result, onSelect }: { result: UserSearchResult; onSelect: () => void }) {
    return (
        <button
            role="option"
            onClick={onSelect}
            className="flex w-full text-left items-center gap-3 px-4 py-3 hover:bg-surface-muted transition-colors cursor-pointer"
        >
            <div className="w-8 h-10 flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text truncate">{result.username}</p>
                <span className="text-xs text-text-secondary">View map</span>
            </div>
        </button>
    );
}

export function SearchResultRow({ result, onSelect }: SearchResultRowProps) {
    switch (result.type) {
        case 'location':
            return <LocationRow result={result} onSelect={onSelect} />;
        case 'user':
            return <UserRow result={result} onSelect={onSelect} />;
    }
}
