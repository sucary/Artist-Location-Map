import { useQuery } from '@tanstack/react-query';
import { getArtists } from '../../services/api';
import { Banner } from './Banner';
import { Trans, useTranslation } from 'react-i18next';
import { TransSpan } from '../i18n/TransComponents';

interface AnonymousUserBannerProps {
    onSignInClick: () => void;
}

export function AnonymousUserBanner({ onSignInClick }: AnonymousUserBannerProps) {
    const { data: artists } = useQuery({
        queryKey: ['artists'],
        queryFn: () => getArtists(),
    });

    const artistCount = artists?.length || 0;
    const { t } = useTranslation();

    return (
        <Banner
            label={t('banner.featuredArtistsLabel')}
            content={
                <Trans
                    i18nKey="banner.featuredArtists"
                    values={{ count: artistCount }}
                    components={{
                        count: <TransSpan className="font-semibold text-primary-contrast app-dark:text-primary-text-dark" />,
                    }}
                />
            }
            action={{ type: 'text', label: t('auth.buttons.signIn'), onClick: onSignInClick }}
        />
    );
}
