import type { LocalizedChain, LocalizedNames } from '../types/city';

type CountryPolicyContext = {
    country?: string | null;
    countryCode?: string | null;
};

const MAINLAND_CHINA_COUNTRY_NAMES: LocalizedNames = {
    en: 'Mainland China',
    ja: '中国大陸',
    zhHans: '中国大陆',
    zhHant: '中國大陸',
    native: '中国大陆',
};

const CHINA_COUNTRY_NAMES: LocalizedNames = {
    en: 'China',
    ja: '中国',
    zhHans: '中国',
    zhHant: '中國',
    native: '中国',
};

const TAIWAN_COUNTRY_NAMES: LocalizedNames = {
    en: 'Taiwan',
    ja: '台湾',
    zhHans: '台湾',
    zhHant: '台灣',
    native: '台灣',
};

const ROC_COUNTRY_NAMES = new Set([
    'republicofchina',
    'roc',
    '中华民国',
    '中華民國',
]);

const normalizeCountryValue = (value?: string | null): string => (
    (value || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase()
);

const hasRepublicOfChinaCountryName = (country?: string | null): boolean => (
    ROC_COUNTRY_NAMES.has(normalizeCountryValue(country))
);

const hasRepublicOfChinaLocalizedName = (country?: LocalizedNames): boolean => (
    Boolean(country && Object.values(country).some(hasRepublicOfChinaCountryName))
);

export function normalizeChinaRegionCountry(country: string, context: CountryPolicyContext): string {
    const countryCode = context.countryCode?.toLowerCase();

    // Product-facing country labels intentionally differ by China-region scope
    if (countryCode === 'cn') return MAINLAND_CHINA_COUNTRY_NAMES.native || country;
    if (countryCode === 'hk' || countryCode === 'mo') return CHINA_COUNTRY_NAMES.native || country;
    if (countryCode === 'tw' && hasRepublicOfChinaCountryName(country)) return TAIWAN_COUNTRY_NAMES.en || country;

    return country;
}

export function applyChinaRegionCountryPolicy(
    chain: LocalizedChain,
    context: CountryPolicyContext
): LocalizedChain {
    const countryCode = context.countryCode?.toLowerCase();

    // Product-facing country labels intentionally differ by China-region scope
    if (countryCode === 'cn') return { ...chain, country: MAINLAND_CHINA_COUNTRY_NAMES };
    if (countryCode === 'hk' || countryCode === 'mo') return { ...chain, country: CHINA_COUNTRY_NAMES };
    if (countryCode === 'tw' && (hasRepublicOfChinaCountryName(context.country) || hasRepublicOfChinaLocalizedName(chain.country))) {
        return { ...chain, country: TAIWAN_COUNTRY_NAMES };
    }

    return chain;
}
