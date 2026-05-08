import { useTranslation } from 'react-i18next';



export function ApprovalPending() {
    const { t } = useTranslation();
    return (
        <div role="status" className="absolute top-16 right-2 z-[1100] bg-warning/10 border border-warning/30 rounded-lg p-3 shadow-md max-w-xs">
            <div className="flex items-start gap-2">
                <svg aria-hidden="true" className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                    <p className="text-sm font-medium text-warning">{t('approval.title')}</p>
                    <p className="text-xs text-text-secondary mt-1">
                        {t('approval.description')}
                    </p>
                </div>
            </div>
        </div>
    );
}
