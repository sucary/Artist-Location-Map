import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useLocationLanguage } from '../../context/LocationLanguageContext';
import { supabase } from '../../lib/supabase';
import { API_URL } from '../../services/api';
import { PageLayout, PageSection } from '../ui';
import type { LocationLanguage } from '../../types/artist';

export function SettingsPage() {
    const queryClient = useQueryClient();
    const { user, profile } = useAuth();

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
        if (username === profile.username) return;

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
                body: JSON.stringify({ username }),
            });

            if (!res.ok) {
                const data = await res.json();
                setUsernameError(data.error || 'Failed to update username');
                return;
            }

            // Refresh profile in context
            window.location.reload();
        } catch {
            setUsernameError('Unable to update username. Please try again.');
        } finally {
            setUsernameSaving(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError(null);

        if (newPassword.length < 6) {
            setPasswordError('New password must be at least 6 characters');
            return;
        }

        if (newPassword !== confirmPassword) {
            setPasswordError('Passwords do not match');
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
                setPasswordError('Current password is incorrect');
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
            setPasswordError('Unable to update password. Please try again.');
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
                setPrivacyError(data.error || 'Failed to update privacy setting');
                return;
            }

            setIsPrivate(newValue);
            // Invalidate profile cache so it reflects the new setting
            queryClient.invalidateQueries({ queryKey: ['profile'] });
        } catch {
            setPrivacyError('Unable to update privacy setting. Please try again.');
        } finally {
            setPrivacySaving(false);
        }
    };

    const inputClass = 'w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-inset focus:ring-primary';

    return (
        <PageLayout title="Settings">
            {/* Privacy */}
            <PageSection title="Privacy">
                <div className="flex items-center justify-between gap-5">
                    <div>
                        <p className="text-sm text-text-secondary">
                            Hide your account from other users.
                        </p>
                        {privacyError && <p className="text-xs text-error mt-1">{privacyError}</p>}
                    </div>
                    <button
                        aria-label={isPrivate ? "Make account public" : "Make account private"}
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

            {/* Location Language */}
            <PageSection title="Language">
                <div>
                    <p className="text-sm text-text-secondary mb-2">
                        Location name
                    </p>
                    <div role="radiogroup" aria-label="Location name language" className="flex flex-wrap gap-2">
                        {([
                            { value: 'en', label: 'English' },
                            { value: 'zhHans', label: '简体中文' },
                            { value: 'zhHant', label: '繁體中文' },
                            { value: 'ja', label: '日本語' },
                            { value: 'native', label: 'Local' },
                        ] as { value: LocationLanguage; label: string }[]).map(({ value, label }) => (
                            <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={locationLanguage === value}
                                onClick={() => setLocationLanguage(value)}
                                className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                                    locationLanguage === value
                                        ? 'bg-primary text-white border-primary'
                                        : 'bg-surface border-border-strong text-text-secondary hover:bg-surface-muted'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-text-muted mt-1">
                        Some location may display in different language.
                    </p>
                </div>
            </PageSection>

            {/* Username */}
            <PageSection title="Username">
                <form onSubmit={handleUsernameSubmit} className="space-y-3">
                    <div>
                        <label 
                            htmlFor="username" 
                            className="block text-sm font-medium text-text-secondary mb-1"
                        >
                            Change username
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
                                setUsername(e.target.value);
                                setUsernameError(null);
                            }}
                            className={inputClass}
                        />
                        {usernameError && <p id="username-error" className="text-xs text-error mt-1">{usernameError}</p>}
                    </div>
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={usernameSaving || username === profile.username || username.length < 3}
                            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {usernameSaving ? 'Saving...' : 'Save username'}
                        </button>
                    </div>
                </form>
            </PageSection>

            {hasPasswordIdentity && (
                <PageSection title="Change Password">
                    <form onSubmit={handlePasswordSubmit} className="space-y-3">
                        <div>
                            <label htmlFor="currentPassword" className="block text-sm font-medium text-text-secondary mb-1">Current password</label>
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
                                <button aria-label={showCurrentPassword ? "Hide password" : "Show password"} type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                                    <EyeIcon open={showCurrentPassword} />
                                </button>
                            </div>
                        </div>
                        <div>
                            <label htmlFor="newPassword" className="block text-sm font-medium text-text-secondary mb-1">New password</label>
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
                                <button aria-label={showNewPassword ? "Hide password" : "Show password"} type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                                    <EyeIcon open={showNewPassword} />
                                </button>
                            </div>
                        </div>
                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-secondary mb-1">Confirm new password</label>
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
                        {passwordError && <p role="alert" className="text-xs text-error">{passwordError}</p>}
                        {passwordSuccess && <p role="status" className="text-xs text-green-600">Password updated successfully</p>}
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
                                className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {passwordSaving ? 'Updating...' : 'Change password'}
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
