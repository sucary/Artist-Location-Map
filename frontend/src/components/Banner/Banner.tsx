import type { ReactNode } from 'react';

type BannerAction =
    | { type: 'text'; label: string; onClick: () => void }
    | { type: 'icon'; icon: ReactNode; onClick: () => void; title: string };

interface BannerProps {
    content: ReactNode;
    action: BannerAction;
}

export function Banner({ content, action }: BannerProps) {
    return (
        <div role="status" className="flex h-10 max-w-full items-center overflow-hidden bg-surface border-2 border-primary rounded-lg shadow-md font-sans">
            <span className="min-w-0 flex-1 truncate whitespace-nowrap px-4 text-sm text-text">
                {content}
            </span>
            <div aria-hidden="true" className="h-6 w-px shrink-0 bg-border" />
            {action.type === 'text' ? (
                <button
                    onClick={action.onClick}
                    className="h-full shrink-0 px-3 text-sm text-text hover:bg-surface-muted transition-colors rounded-r-lg font-medium"
                >
                    {action.label}
                </button>
            ) : (
                <button
                    aria-label={action.title}
                    onClick={action.onClick}
                    className="h-full shrink-0 px-3 text-text-secondary hover:bg-surface-muted hover:text-text transition-colors rounded-r-lg"
                    title={action.title}
                >
                    {action.icon}
                </button>
            )}
        </div>
    );
}

export const HomeIcon = () => (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
);
