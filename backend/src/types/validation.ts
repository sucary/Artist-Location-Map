import { Location, SocialLinks } from './artist';

/**
 * Validates coordinate values
 */
export const isValidCoordinates = (lat: number, lng: number): boolean => {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

/**
 * Validates location object
 */
export const isValidLocation = (location: Location): boolean => {
    return (
        typeof location.city === 'string' &&
        location.city.trim().length > 0 &&
        typeof location.province === 'string' &&
        location.province.trim().length > 0 &&
        typeof location.coordinates.lat === 'number' &&
        typeof location.coordinates.lng === 'number' &&
        isValidCoordinates(location.coordinates.lat, location.coordinates.lng)
    );
};

/**
 * Validates URL format
 */
export const isValidUrl = (url: string): boolean => {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
};

/**
 * Validates social links
 */
export const isValidSocialLinks = (links: SocialLinks): boolean => {
    const urls = [links.instagram, links.twitter, links.spotify, links.website].filter(Boolean);
    return urls.every(url => url && isValidUrl(url));
};