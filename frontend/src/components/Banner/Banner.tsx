import type { ReactNode } from 'react';

type BannerAction =
    | { type: 'text'; label: string; onClick: () => void }
    | { type: 'icon'; icon: ReactNode; onClick: () => void; title: string };

interface BannerProps {
    label?: ReactNode;
    content: ReactNode;
    action: BannerAction;
}

export function Banner({ label, content, action }: BannerProps) {
    return (
        <div className={`relative max-w-full font-sans ${label ? 'pt-[22px]' : ''}`}>
            {label && (
                <div className="absolute left-1/2 top-0 z-20 max-w-[70%] -translate-x-1/2">
                    <span className="block truncate rounded-t-lg border-2 border-b-0 border-primary-contrast bg-primary-contrast px-4 py-1 text-center text-sm font-medium leading-none text-white">
                        {label}
                    </span>
                </div>
            )}
            <div role="status" className="relative z-10 flex min-h-10 max-w-full items-stretch overflow-hidden bg-surface border-2 border-[var(--color-primary)] rounded-lg shadow-md">
                <div className="min-w-0 flex-1 p-2">
                    <span className="block truncate whitespace-nowrap text-sm text-text">
                        {content}
                    </span>
                </div>
                <div aria-hidden="true" className="h-6 w-px shrink-0 self-center bg-border" />
                {action.type === 'text' ? (
                    <button
                        onClick={action.onClick}
                        className="flex shrink-0 items-center justify-center px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-muted"
                    >
                        {action.label}
                    </button>
                ) : (
                    <button
                        aria-label={action.title}
                        onClick={action.onClick}
                        className="flex w-10 shrink-0 items-center justify-center py-2 text-text-secondary transition-colors hover:bg-surface-muted hover:text-text"
                        title={action.title}
                    >
                        {action.icon}
                    </button>
                )}
            </div>
        </div>
    );
}

export const HomeIcon = () => (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
);
