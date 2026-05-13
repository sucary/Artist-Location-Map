import { Banner, HomeIcon } from './Banner';
import { Trans, useTranslation } from 'react-i18next';
import { TransSpan } from '../i18n/TransComponents';

interface FeaturedArtistsBannerProps {
    artistCount: number;
    onHomeClick: () => void;
}

export function FeaturedArtistsBanner({ artistCount, onHomeClick }: FeaturedArtistsBannerProps) {
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
            action={{ type: 'icon', icon: <HomeIcon />, onClick: onHomeClick, title: t('banner.backToMyMap') }}
        />
    );
}
