import { useState } from 'react';
import { Spinner, Alert, Button, Input, ConfirmDialog } from '../ui';
import { searchCities, getLocalizedNames, updateLocalizedNames, resetLocalizedNames } from '../../services/api';
import type { SearchResult } from '../../services/api';
import type { LocalizedChain, LocalizedNames } from '../../types/artist';

const LANGS: { key: keyof LocalizedNames; label: string }[] = [
    { key: 'en', label: 'EN' },
    { key: 'zhHans', label: '简' },
    { key: 'zhHant', label: '繁' },
    { key: 'ja', label: 'JA' },
];

type ChainLevel = 'city' | 'province' | 'country';

function countMissing(names: LocalizedNames | undefined): number {
    if (!names) return LANGS.length;
    return LANGS.filter(({ key }) => !names[key]).length;
}

export function LocalizationEditor() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);

    const [selectedLocation, setSelectedLocation] = useState<SearchResult | null>(null);
    const [chain, setChain] = useState<LocalizedChain | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    const handleSearch = async () => {
        if (query.trim().length < 2) return;
        setSearching(true);
        setSearchError(null);
        setSelectedLocation(null);
        setChain(null);
        setMessage(null);
        try {
            const res = await searchCities(query.trim(), 10, 'local');
            setResults(res.results);
            if (res.results.length === 0) setSearchError('No locations found in database.');
        } catch {
            setSearchError('Search failed');
        } finally {
            setSearching(false);
        }
    };

    const handleSelect = async (location: SearchResult) => {
        if (!location.id) {
            setMessage({ text: 'This location has no database ID', type: 'error' });
            return;
        }
        setSelectedLocation(location);
        setLoading(true);
        setMessage(null);
        try {
            const data = await getLocalizedNames(location.id);
            setChain(data.chain);
        } catch {
            setChain({ city: {} });
        } finally {
            setLoading(false);
        }
    };

    const updateField = (level: ChainLevel, lang: keyof LocalizedNames, value: string) => {
        setChain(prev => {
            if (!prev) return prev;
            const updated = { ...prev };
            if (level === 'city') {
                updated.city = { ...updated.city, [lang]: value || undefined };
            } else {
                updated[level] = { ...(updated[level] || {}), [lang]: value || undefined };
            }
            return updated;
        });
    };

    const handleSave = async () => {
        if (!selectedLocation?.id || !chain) return;
        setSaving(true);
        setMessage(null);
        try {
            await updateLocalizedNames(selectedLocation.id, chain);
            setMessage({ text: 'Saved', type: 'success' });
        } catch {
            setMessage({ text: 'Failed to save', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        if (!selectedLocation?.id) return;
        setSaving(true);
        setMessage(null);
        try {
            const data = await resetLocalizedNames(selectedLocation.id);
            setChain(data.localizedNames);
            setMessage({ text: 'Reset and refreshed', type: 'success' });
        } catch {
            setMessage({ text: 'Failed to reset and refresh', type: 'error' });
        } finally {
            setSaving(false);
            setShowResetConfirm(false);
        }
    };

    const getLevels = (): { level: ChainLevel; label: string; dbValue: string }[] => {
        if (!selectedLocation) return [];
        const levels: { level: ChainLevel; label: string; dbValue: string }[] = [];
        levels.push({ level: 'city', label: selectedLocation.type || 'city', dbValue: selectedLocation.name });
        if (selectedLocation.province && selectedLocation.province !== selectedLocation.name) {
            levels.push({ level: 'province', label: 'province', dbValue: selectedLocation.province });
        }
        if (selectedLocation.country) {
            levels.push({ level: 'country', label: 'country', dbValue: selectedLocation.country });
        }
        return levels;
    };

    return (
        <div>
            {/* Search */}
            <div className="flex gap-2 mb-3">
                <Input
                    name="localization-location-search"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="Search location..."
                    className="flex-1"
                />
                <Button onClick={handleSearch} disabled={searching || query.trim().length < 2}>
                    {searching ? <Spinner size="sm" /> : 'Search'}
                </Button>
            </div>

            {searchError && <Alert variant="error" header="Location search failed" className="mb-3">{searchError}</Alert>}

            {/* Search results */}
            {results.length > 0 && !selectedLocation && (
                <div className="space-y-1 mb-3 max-h-48 overflow-y-auto">
                    {results.map((r, i) => {
                        const lc = r.localizedChain;
                        const missing = countMissing(lc?.city)
                            + (r.province && r.province !== r.name ? countMissing(lc?.province) : 0)
                            + (r.country ? countMissing(lc?.country) : 0);
                        return (
                            <button
                                key={r.id || i}
                                onClick={() => handleSelect(r)}
                                className="w-full text-left px-3 py-2 rounded hover:bg-surface-hover text-sm text-text border border-border flex items-center justify-between"
                            >
                                <span>
                                    <span className="font-medium">{r.name}</span>
                                    <span className="text-text-secondary ml-1">
                                        {r.province}{r.country ? `, ${r.country}` : ''}
                                    </span>
                                </span>
                                {missing > 0 && <span className="text-xs text-warning shrink-0">{missing} missing</span>}
                                {missing === 0 && lc && <span className="text-xs text-success shrink-0">ok</span>}
                                {!lc && <span className="text-xs text-error shrink-0 app-dark:text-primary app-dark:font-bold">none</span>}
                            </button>
                        );
                    })}
                </div>
            )}

            {loading && <Spinner size="sm" className="mx-auto text-primary my-3" />}

            {/* Editor */}
            {chain && selectedLocation && !loading && (
                <div className="border border-border rounded-lg p-4">
                    {/* Selected location header */}
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-sm font-medium text-text">
                            {selectedLocation.name}
                            {selectedLocation.province && selectedLocation.province !== selectedLocation.name
                                ? `, ${selectedLocation.province}` : ''}
                            {selectedLocation.country ? `, ${selectedLocation.country}` : ''}
                        </span>
                        <button
                            onClick={() => { setSelectedLocation(null); setChain(null); setMessage(null); }}
                            className="text-xs text-text-secondary hover:text-text"
                        >
                            Change
                        </button>
                    </div>

                    {/* Column headers */}
                    <div className="grid items-center gap-2 mb-1" style={{ gridTemplateColumns: '6rem repeat(4, 1fr)' }}>
                        <span />
                        {LANGS.map(({ label }) => (
                            <span key={label} className="text-xs text-text-muted text-center">{label}</span>
                        ))}
                    </div>

                    {/* One row per level */}
                    <div className="space-y-2">
                        {getLevels().map(({ level, label, dbValue }) => {
                            const names = chain[level];
                            const hasMissing = LANGS.some(({ key }) => !names?.[key]);
                            return (
                                <div key={level} className="grid items-center gap-2" style={{ gridTemplateColumns: '6rem repeat(4, 1fr)' }}>
                                    <span className="text-sm text-text-secondary capitalize truncate" title={dbValue}>
                                        {hasMissing && <span className="text-warning mr-1">*</span>}
                                        {label}
                                    </span>
                                    {LANGS.map(({ key, label: langLabel }) => (
                                        <Input
                                            key={key}
                                            name={`localization-${level}-${key}`}
                                            autoComplete="off"
                                            autoCorrect="off"
                                            spellCheck={false}
                                            value={names?.[key] || ''}
                                            onChange={e => updateField(level, key, e.target.value)}
                                            placeholder={langLabel}
                                            className={!names?.[key] ? 'border-warning/50' : ''}
                                        />
                                    ))}
                                </div>
                            );
                        })}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-4">
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? <Spinner size="sm" /> : 'Save'}
                        </Button>
                        <Button onClick={() => setShowResetConfirm(true)} disabled={saving} variant="secondary">
                            Reset
                        </Button>
                    </div>
                    {message && (
                        <Alert
                            variant={message.type === 'success' ? 'success' : 'error'}
                            header={message.type === 'success' ? 'Translations saved' : 'Translation update failed'}
                            className="mt-3"
                        >
                            {message.text}
                        </Alert>
                    )}
                </div>
            )}
            {showResetConfirm && (
                <ConfirmDialog
                    open
                    title="Reset translations?"
                    variant="warning"
                    confirmButtonVariant="secondary"
                    confirmLabel="Reset"
                    cancelLabel="Cancel"
                    isLoading={saving}
                    onCancel={() => setShowResetConfirm(false)}
                    onConfirm={() => { void handleReset(); }}
                >
                    Manual edits will be lost and translations will be auto-fetched again on next use.
                </ConfirmDialog>
            )}
        </div>
    );
}
