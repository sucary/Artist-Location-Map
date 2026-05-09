import { useQuery } from '@tanstack/react-query';
import { getArtists } from '../../services/api';
import { Banner } from './Banner';
import { useTranslation } from 'react-i18next';

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
            content={<><span className="font-semibold text-primary">{artistCount}</span> {t('banner.featuredArtists')}</>}
            action={{ type: 'text', label: t('auth.buttons.signIn'), onClick: onSignInClick }}
        />
    );
}
