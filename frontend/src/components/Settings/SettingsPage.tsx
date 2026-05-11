import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useLocationLanguage } from '../../context/LocationLanguageContext';
import { supabase } from '../../lib/supabase';
import { API_URL } from '../../services/api';
import { Alert, PageLayout, PageSection } from '../ui';
import type { LocationLanguage } from '../../types/artist';
import { useTranslation } from 'react-i18next';

type UiLanguage = 'en' | 'zh' | 'zh-Hant' | 'ja';
const normalizeUsername = (value: string) => value.trim().toLowerCase();
const isValidUsername = (value: string) => (
    value.length >= 3 &&
    value.length <= 32 &&
    /^[a-z0-9_]+$/.test(value)
);

const getUiLanguage = (language: string): UiLanguage => {
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
};

export function SettingsPage() {
    const queryClient = useQueryClient();
    const { user, profile } = useAuth();
    const { t, i18n } = useTranslation();

    // Username state
    const [username, setUsername] = useState(profile?.username || '');
    const [usernameError, setUsernameError] = useState<string | null>(null);
    const [usernameSaving, setUsernameSaving] = useState(false);

    // Password state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordSuccess, setPasswordSuccess] = useState(false);

    // Privacy state
    const [isPrivate, setIsPrivate] = useState(profile?.isPrivate ?? false);
    const [privacySaving, setPrivacySaving] = useState(false);
    const [privacyError, setPrivacyError] = useState<string | null>(null);

    // Location language
    const { locationLanguage, setLocationLanguage } = useLocationLanguage();
    const uiLanguage = getUiLanguage(i18n.resolvedLanguage || i18n.language || 'en');
    const uiLanguageOptions: { value: UiLanguage; label: string }[] = [
        { value: 'en', label: 'English' },
        { value: 'zh', label: '\u7b80\u4f53\u4e2d\u6587' },
        { value: 'zh-Hant', label: '\u7e41\u9ad4\u4e2d\u6587' },
        { value: 'ja', label: '\u65e5\u672c\u8a9e' },
    ];
    const locationLanguageOptions: { value: LocationLanguage; label: string }[] = [
        { value: 'en', label: 'English' },
        { value: 'zhHans', label: '\u7b80\u4f53\u4e2d\u6587' },
        { value: 'zhHant', label: '\u7e41\u9ad4\u4e2d\u6587' },
        { value: 'ja', label: '\u65e5\u672c\u8a9e' },
        { value: 'native', label: t('settings.language.native') },
    ];

    // Sync isPrivate with profile when it changes
    useEffect(() => {
        if (profile) {
            setIsPrivate(profile.isPrivate ?? false);
        }
    }, [profile]);

    if (!user || !profile) return null;

    const hasPasswordIdentity = user.identities?.some((identity) => identity.provider === 'email') ?? false;

    const handleUsernameSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const normalizedUsername = normalizeUsername(username);
        if (normalizedUsername === profile.username) return;
        if (normalizedUsername.length < 3) {
            setUsernameError(t('auth.errors.userNameMin'));
            return;
        }
        if (normalizedUsername.length > 32) {
            setUsernameError(t('auth.errors.userNameMax'));
            return;
        }
        if (!isValidUsername(normalizedUsername)) {
            setUsernameError(t('auth.errors.userNamePattern'));
            return;
        }

        setUsernameSaving(true);
        setUsernameError(null);

        try {
            const token = (await supabase.auth.getSession()).data.session?.access_token;
            const res = await fetch(`${API_URL}/auth/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ username: normalizedUsername }),
            });

            if (!res.ok) {
                const data = await res.json();
                setUsernameError(data.error || t('settings.errors.failedUpdateUsername'));
                return;
            }

            // Refresh profile in context
            window.location.reload();
        } catch {
            setUsernameError(t('settings.errors.unableUpdateUsername'));
        } finally {
            setUsernameSaving(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError(null);

        if (newPassword.length < 6) {
            setPasswordError(t('settings.errors.newPasswordMin'));
            return;
        }

        if (newPassword !== confirmPassword) {
            setPasswordError(t('auth.errors.passwordsMatch'));
            return;
        }

        setPasswordSaving(true);

        try {
            // Verify current password by signing in
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: profile.email,
                password: currentPassword,
            });

            if (signInError) {
                setPasswordError(t('settings.errors.currentPasswordIncorrect'));
                setPasswordSaving(false);
                return;
            }

            // Update password
            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword,
            });

            if (updateError) {
                setPasswordError(updateError.message);
                return;
            }

            setPasswordSuccess(true);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch {
            setPasswordError(t('settings.errors.unableUpdatePassword'));
        } finally {
            setPasswordSaving(false);
        }
    };

    const handlePrivacyToggle = async () => {
        const newValue = !isPrivate;
        setPrivacySaving(true);
        setPrivacyError(null);

        try {
            const token = (await supabase.auth.getSession()).data.session?.access_token;
            const res = await fetch(`${API_URL}/auth/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ isPrivate: newValue }),
            });

            if (!res.ok) {
                const data = await res.json();
                setPrivacyError(data.error || t('settings.errors.failedUpdatePrivacy'));
                return;
            }

            setIsPrivate(newValue);
            // Invalidate profile cache so it reflects the new setting
            queryClient.invalidateQueries({ queryKey: ['profile'] });
        } catch {
            setPrivacyError(t('settings.errors.unableUpdatePrivacy'));
        } finally {
            setPrivacySaving(false);
        }
    };

    const inputClass = 'w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-inset focus:ring-primary';

    return (
        <PageLayout title={t('settings.title')}>
            {/* Privacy */}
            <PageSection title={t('settings.privacy.title')}>
                <div className="flex items-center justify-between gap-5">
                    <div>
                        <p className="text-sm text-text-secondary">
                            {t('settings.privacy.description')}
                        </p>
                        {privacyError && (
                            <Alert variant="error" header={t('settings.privacy.errorHeader')} className="mt-2">
                                {privacyError}
                            </Alert>
                        )}
                    </div>
                    <button
                        aria-label={isPrivate ? t('settings.privacy.makePublic') : t('settings.privacy.makePrivate')}
                        type="button"
                        role="switch"
                        aria-checked={isPrivate}
                        onClick={handlePrivacyToggle}
                        disabled={privacySaving}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${isPrivate ? 'bg-primary' : 'bg-border-strong'}`}
                    >
                        <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${isPrivate ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                </div>
            </PageSection>

            {/* Language */}
            <PageSection title={t('settings.language.title')}>
                <div className="space-y-5">
                    <div>
                        <p className="text-sm text-text-secondary mb-2">
                            {t('settings.uiLanguage.language')}
                        </p>
                        <div role="radiogroup" aria-label={t('settings.uiLanguage.language')} className="flex flex-wrap gap-2">
                            {uiLanguageOptions.map(({ value, label }) => (
                                <button
                                    key={value}
                                    type="button"
                                    role="radio"
                                    aria-checked={uiLanguage === value}
                                    onClick={() => void i18n.changeLanguage(value)}
                                    className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                                        uiLanguage === value
                                            ? 'bg-primary-contrast text-white border-primary-contrast'
                                            : 'bg-surface border-border-strong text-text-secondary hover:bg-surface-muted'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="text-sm text-text-secondary mb-2">
                            {t('settings.language.locationName')}
                        </p>
                        <div role="radiogroup" aria-label={t('settings.language.locationNameLanguage')} className="flex flex-wrap gap-2">
                            {locationLanguageOptions.map(({ value, label }) => (
                                <button
                                    key={value}
                                    type="button"
                                    role="radio"
                                    aria-checked={locationLanguage === value}
                                    onClick={() => setLocationLanguage(value)}
                                    className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                                        locationLanguage === value
                                            ? 'bg-primary-contrast text-white border-primary-contrast'
                                            : 'bg-surface border-border-strong text-text-secondary hover:bg-surface-muted'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-text-muted mt-1">
                            {t('settings.language.hint')}
                        </p>
                    </div>
                </div>
            </PageSection>

            {/* Username */}
            <PageSection title={t('settings.username.title')}>
                <form onSubmit={handleUsernameSubmit} className="space-y-3">
                    <div>
                        <label 
                            htmlFor="username" 
                            className="block text-sm font-medium text-text-secondary mb-1"
                        >
                            {t('settings.username.changeUsername')}
                        </label>
                        <input
                            id="username"
                            name="settings-username"
                            autoComplete="username"
                            autoCorrect="off"
                            spellCheck={false}
                            aria-describedby={usernameError ? "username-error" : undefined}
                            aria-invalid={!!usernameError}
                            type="text"
                            value={username}
                            onChange={(e) => {
                                setUsername(normalizeUsername(e.target.value));
                                setUsernameError(null);
                            }}
                            maxLength={32}
                            className={inputClass}
                        />
                        {usernameError && (
                            <div id="username-error">
                                <Alert variant="error" header={t('settings.username.errorHeader')} className="mt-2">
                                    {usernameError}
                                </Alert>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={usernameSaving || normalizeUsername(username) === profile.username || !isValidUsername(normalizeUsername(username))}
                            className="px-4 py-2 text-sm font-medium text-white bg-primary-contrast rounded-md hover:bg-primary-contrast-hover disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {usernameSaving ? t('common.saving') : t('settings.username.saveUsername')}
                        </button>
                    </div>
                </form>
            </PageSection>

            {hasPasswordIdentity && (
                <PageSection title={t('settings.password.title')}>
                    <form onSubmit={handlePasswordSubmit} className="space-y-3" noValidate>
                        <div>
                            <label htmlFor="currentPassword" className="block text-sm font-medium text-text-secondary mb-1">{t('auth.fields.currentPassword')}</label>
                            <div className="relative">
                                <input
                                    id="currentPassword"
                                    name="current-password"
                                    autoComplete="current-password"
                                    type={showCurrentPassword ? 'text' : 'password'}
                                    value={currentPassword}
                                    onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(null); setPasswordSuccess(false); }}
                                    className={`${inputClass} pr-10`}
                                />
                                <button aria-label={showCurrentPassword ? t('auth.buttons.hidePassword') : t('auth.buttons.showPassword')} type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                                    <EyeIcon open={showCurrentPassword} />
                                </button>
                            </div>
                        </div>
                        <div>
                            <label htmlFor="newPassword" className="block text-sm font-medium text-text-secondary mb-1">{t('auth.fields.newPassword')}</label>
                            <div className="relative">
                                <input
                                    id="newPassword"
                                    name="new-password"
                                    autoComplete="new-password"
                                    type={showNewPassword ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null); setPasswordSuccess(false); }}
                                    className={`${inputClass} pr-10`}
                                    minLength={6}
                                />
                                <button aria-label={showNewPassword ? t('auth.buttons.hidePassword') : t('auth.buttons.showPassword')} type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                                    <EyeIcon open={showNewPassword} />
                                </button>
                            </div>
                        </div>
                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-secondary mb-1">{t('auth.fields.confirmNewPassword')}</label>
                            <input
                                id="confirmPassword"
                                name="confirm-new-password"
                                autoComplete="new-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(null); setPasswordSuccess(false); }}
                                className={inputClass}
                                minLength={6}
                            />
                        </div>
                        {passwordError && (
                            <Alert variant="error" header={t('settings.password.errorHeader')}>
                                {passwordError}
                            </Alert>
                        )}
                        {passwordSuccess && (
                            <Alert variant="success" header={t('auth.resetPassword.passwordUpdated')}>
                                {t('settings.password.success')}
                            </Alert>
                        )}
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
                                className="px-4 py-2 text-sm font-medium text-white bg-primary-contrast rounded-md hover:bg-primary-contrast-hover disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {passwordSaving ? t('auth.resetPassword.updating') : t('settings.password.changePassword')}
                            </button>
                        </div>
                    </form>
                </PageSection>
            )}
        </PageLayout>
    );
}

function EyeIcon({ open }: { open: boolean }) {
    if (open) {
        return (
            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
        );
    }
    return (
        <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
    );
}
