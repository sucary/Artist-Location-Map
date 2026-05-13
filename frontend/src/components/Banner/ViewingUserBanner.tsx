import { useNavigate } from 'react-router-dom';
import { Banner, HomeIcon } from './Banner';
import { Trans, useTranslation } from 'react-i18next';
import { TransSpan } from '../i18n/TransComponents';

interface ViewingUserBannerProps {
    username: string;
}

export function ViewingUserBanner({ username }: ViewingUserBannerProps) {
    const navigate = useNavigate();
    const { t } = useTranslation();

    return (
        <Banner
            content={
                <Trans
                    i18nKey="banner.viewingUser"
                    values={{ username }}
                    components={{
                        username: <TransSpan className="font-semibold text-primary-contrast app-dark:text-primary-text-dark" />,
                    }}
                />
            }
            action={{ type: 'icon', icon: <HomeIcon />, onClick: () => navigate('/'), title: t('banner.backToMyMap') }}
        />
    );
}
