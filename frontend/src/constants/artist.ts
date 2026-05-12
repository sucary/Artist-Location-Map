// Artist domain constants

export const MAX_NAME_LENGTH = 28;

export const ASPECT_RATIOS = {
    avatar: 1,
    profile: 2.5,
} as const;

export const CLOUDINARY_OUTPUT_SIZES = {
    avatar: 400,
    profile: 800,
} as const;

export const SOCIAL_LINK_KEYS = ['website', 'instagram', 'twitter', 'appleMusic', 'youtube'] as const;

export type SocialLinkKey = typeof SOCIAL_LINK_KEYS[number];
