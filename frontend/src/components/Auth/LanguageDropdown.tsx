import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getUiLanguage, type UiLanguage } from '../../i18n/uiLanguage';

const LANGUAGE_OPTIONS: { value: UiLanguage; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'zh', label: '\u7b80\u4f53\u4e2d\u6587' },
    { value: 'zh-Hant', label: '\u7e41\u9ad4\u4e2d\u6587' },
    { value: 'ja', label: '\u65e5\u672c\u8a9e' },
];

/**
 * Language selector for anonymous (non-logged-in) visitors. Changing the
 * language updates i18n immediately and is persisted to localStorage by the
 * i18next language detector. Because the Supabase signup/confirmation email
 * language is derived from the active i18n language (see AuthContext.signUp ->
 * getUiLanguage), this selection also controls the SMTP/email language.
 */
export function LanguageDropdown() {
    const { t, i18n } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const currentLanguage = getUiLanguage(i18n.resolvedLanguage || i18n.language || 'en');
    const currentLabel = LANGUAGE_OPTIONS.find((option) => option.value === currentLanguage)?.label ?? 'English';

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (language: UiLanguage) => {
        void i18n.changeLanguage(language);
        setIsOpen(false);
    };

    return (
        <div ref={containerRef} className="relative inline-block">
            <button
                type="button"
                aria-expanded={isOpen}
                aria-haspopup="true"
                aria-label={t('common.selectLanguage')}
                onClick={() => setIsOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-1.5 bg-surface px-3 py-2 rounded-md shadow-md hover:bg-surface-muted active:bg-surface-muted transition-colors text-text text-sm font-medium"
            >
                <span className="flex items-center gap-1.5 min-w-0">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-text-secondary">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M3 12h18" />
                        <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
                    </svg>
                    <span className="truncate">{currentLabel}</span>
                </span>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                    <path d="m6 9 6 6 6-6" />
                </svg>
            </button>

            {isOpen && (
                <div
                    role="menu"
                    aria-label={t('common.selectLanguage')}
                    onKeyDown={(e) => { if (e.key === 'Escape') setIsOpen(false); }}
                    className="absolute top-full right-0 mt-1 w-full bg-surface rounded-lg shadow-lg border border-border z-[1001]"
                >
                    {LANGUAGE_OPTIONS.map(({ value, label }, index) => (
                        <button
                            key={value}
                            type="button"
                            role="menuitemradio"
                            aria-checked={currentLanguage === value}
                            onClick={() => handleSelect(value)}
                            className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-surface-muted ${
                                currentLanguage === value ? 'text-primary-contrast font-medium' : 'text-text'
                            } ${index === 0 ? 'rounded-t-lg' : ''} ${index === LANGUAGE_OPTIONS.length - 1 ? 'rounded-b-lg' : ''}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
