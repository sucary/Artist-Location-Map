import { Banner, HomeIcon } from './Banner';
import { useTranslation } from 'react-i18next';

interface FeaturedArtistsBannerProps {
    artistCount: number;
    onHomeClick: () => void;
}

export function FeaturedArtistsBanner({ artistCount, onHomeClick }: FeaturedArtistsBannerProps) {
    const { t } = useTranslation();
    return (
        <Banner
            content={<><span className="font-semibold text-primary">{artistCount}</span> {t('banner.featuredArtists')}</>}
            action={{ type: 'icon', icon: <HomeIcon />, onClick: onHomeClick, title: t('banner.backToMyMap') }}
        />
    );
}
