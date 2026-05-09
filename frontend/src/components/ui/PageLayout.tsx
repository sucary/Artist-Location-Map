import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface PageLayoutProps {
    title: string;
    children: ReactNode;
}

export function PageLayout({ title, children }: PageLayoutProps) {
    const navigate = useNavigate();
    const { t } = useTranslation();

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-lg mx-auto px-4 py-4">
                <div className="flex items-center gap-4 mb-4">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-1 text-sm text-text-secondary hover:text-text transition-colors cursor-pointer"
                    >
                        <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        <span>{t('common.backToMap')}</span>
                    </button>
                    <span className="text-border-strong">|</span>
                    <h1 className="text-lg font-bold text-text">{title}</h1>
                </div>
                <div className="bg-surface rounded-lg border border-border divide-y divide-border">
                    {children}
                </div>
            </div>
        </div>
    );
}

interface PageSectionProps {
    title?: string;
    children: ReactNode;
}

export function PageSection({ title, children }: PageSectionProps) {
    return (
        <div className="p-5">
            {title && <h2 className="text-lg text-text mb-3">{title}</h2>}
            {children}
        </div>
    );
}
