import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { CloseButton } from '../ui';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import { useTranslation } from 'react-i18next';

interface ResetPasswordModalProps {
    onClose: () => void;
}

export function ResetPasswordModal({ onClose }: ResetPasswordModalProps) {
    const dialogRef = useDialogAccessibility(onClose);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const { t } = useTranslation();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 6) {
            setError(t('auth.errors.passwordMin'));
            return;
        }

        if (password !== confirmPassword) {
            setError(t('auth.errors.passwordsMatch'));
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.updateUser({ password });
        setLoading(false);

        if (error) {
            if (error.message === 'Auth session missing!') {
                setError(t('auth.resetPassword.authSessionExpired'));
            } else {
                setError(t('auth.errors.unexpectedError'));
            }
        } else {
            setSuccess(true);
            setTimeout(onClose, 5000);
        }
    };

    const inputClass = 'w-full px-3 py-2 bg-surface border border-border-strong rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-inset focus:ring-primary';

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center">
            <div aria-hidden="true" className="absolute inset-0 bg-black/50" onClick={onClose} />

            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="reset-password-title"
                tabIndex={-1}
                className="relative bg-surface rounded-lg shadow-xl w-full max-w-md mx-4 p-6 focus:outline-none"
            >
                <CloseButton onClick={onClose} size="lg" className="absolute top-4 right-4" />
                {success ? (
                    <div className="text-center">
                        <svg aria-hidden="true" className="w-12 h-12 text-success mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <h2 className="text-xl font-bold text-text mb-2">{t('auth.resetPassword.passwordUpdated')}</h2>
                        <p className="text-sm text-text-secondary">{t('common.redirectToMap')}</p>
                    </div>
                ) : (
                    <>
                        <h2 id="reset-password-title" className="text-xl font-bold text-text mb-6">{t('auth.resetPassword.title')}</h2>

                        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                            <div>
                                <label htmlFor="reset-new-password" className="block text-sm font-medium text-text mb-1">{t('auth.fields.newPassword')}</label>
                                <div className="relative">
                                    <input
                                        id="reset-new-password"
                                        name="new-password"
                                        autoComplete="new-password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => { setPassword(e.target.value); setError(null); }}
                                        className={`${inputClass} pr-10`}
                                        minLength={6}
                                        required
                                        autoFocus
                                    />
                                    <button
                                        aria-label={showPassword ? t('auth.buttons.hidePassword') : t('auth.buttons.showPassword')}
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                                    >
                                        {showPassword ? (
                                            <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                            </svg>
                                        ) : (
                                            <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="reset-confirm-password" className="block text-sm font-medium text-text mb-1">{t('auth.fields.confirmNewPassword')}</label>
                                <input
                                    id="reset-confirm-password"
                                    name="confirm-new-password"
                                    autoComplete="new-password"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                                    className={inputClass}
                                    minLength={6}
                                    required
                                />
                            </div>

                            {error && <p role="alert" className="text-error text-sm app-dark:text-primary app-dark:font-bold">{error}</p>}

                            <button
                                type="submit"
                                disabled={loading || !password || !confirmPassword}
                                className="w-full py-2.5 bg-primary-contrast text-white rounded-lg hover:bg-primary-contrast-hover transition-colors disabled:opacity-50"
                            >
                                {loading ? t('auth.resetPassword.updating') : t('auth.buttons.resetPassword')}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}
