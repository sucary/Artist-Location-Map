// Canonical mapping from an i18n language tag (which may be a regional variant
// like `zh-TW` or `en-US`) to one of the four UI languages the app persists and
// the Supabase auth-email templates branch on.
export type UiLanguage = 'en' | 'zh' | 'zh-Hant' | 'ja';

export function getUiLanguage(language: string | null | undefined): UiLanguage {
    if (!language) return 'en';
    if (language === 'zh-Hant' || language.startsWith('zh-Hant-') || ['zh-TW', 'zh-HK', 'zh-MO'].includes(language)) {
        return 'zh-Hant';
    }
    if (language === 'zh' || language.startsWith('zh-')) {
        return 'zh';
    }
    if (language === 'ja' || language.startsWith('ja-')) {
        return 'ja';
    }
    return 'en';
}
