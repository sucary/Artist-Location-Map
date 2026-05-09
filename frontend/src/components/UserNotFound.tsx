import { useNavigate } from 'react-router-dom';
import { Button } from './ui';
import { useTranslation } from 'react-i18next';

interface UserNotFoundProps {
    username: string;
}

export function UserNotFound({ username }: UserNotFoundProps) {
    const navigate = useNavigate();
    const { t } = useTranslation();

    const handleGoBack = () => {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate('/');
        }
    };

    return (
        <div className="h-screen w-screen flex items-center justify-center bg-surface-secondary">
            <div className="max-w-sm px-6">
                <h1 className="text-xl font-medium text-text mb-4">
                    {t('userNotFound.title', { username })}
                </h1>
                <p className="text-sm text-text-muted mb-2">{t('userNotFound.reasonsIntro')}</p>
                <ul className="text-sm text-text-muted mb-6 list-disc list-inside space-y-1">
                    <li>{t('userNotFound.reasons.doesNotExist')}</li>
                    <li>{t('userNotFound.reasons.private')}</li>
                    <li>{t('userNotFound.reasons.deleted')}</li>
                </ul>
                <Button onClick={handleGoBack} variant="primary">
                    {t('userNotFound.goBack')}
                </Button>
            </div>
        </div>
    );
}
