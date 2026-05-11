import { Banner, HomeIcon } from './Banner';
import { Trans, useTranslation } from 'react-i18next';

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
                        count: <span className="font-semibold text-primary-contrast" />,
                    }}
                />
            }
            action={{ type: 'icon', icon: <HomeIcon />, onClick: onHomeClick, title: t('banner.backToMyMap') }}
        />
    );
}
