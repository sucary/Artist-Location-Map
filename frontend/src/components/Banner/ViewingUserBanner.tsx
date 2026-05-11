import { useNavigate } from 'react-router-dom';
import { Banner, HomeIcon } from './Banner';
import { Trans, useTranslation } from 'react-i18next';

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
                        username: <span className="font-semibold text-primary-contrast" />,
                    }}
                />
            }
            action={{ type: 'icon', icon: <HomeIcon />, onClick: () => navigate('/'), title: t('banner.backToMyMap') }}
        />
    );
}
