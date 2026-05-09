import type { Coordinates } from './types';
import { useTranslation } from 'react-i18next';

interface SelectionPromptProps {
    onCancel?: ((coordinates: Coordinates | null) => void) | null;
}

export function SelectionPrompt({ onCancel }: SelectionPromptProps) {
    const { t } = useTranslation();
    return (
        <div className="absolute top-16 inset-x-2 z-[1100] flex justify-center sm:inset-x-auto sm:top-auto sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2">
            <div role="alert" className="flex h-10 max-w-full items-center overflow-hidden bg-surface border-2 border-primary rounded-lg shadow-md font-sans">
                <span className="min-w-0 flex-1 truncate whitespace-nowrap px-4 text-sm text-text">
                    {t('map.manualLocationSelection')}
                </span>
                <div aria-hidden="true" className="h-6 w-px shrink-0 bg-border" />
                <button
                    onClick={() => onCancel?.(null)}
                    className="h-full shrink-0 px-3 text-sm text-text hover:bg-surface-muted transition-colors rounded-r-lg font-medium"
                >
                    {t('map.cancel')}
                </button>
            </div>
        </div>
    );
}
