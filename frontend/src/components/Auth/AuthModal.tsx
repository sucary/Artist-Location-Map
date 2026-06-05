import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Input, Button, Spinner, Alert, IconButton, CloseButton } from '../ui';
import { EyeIcon, EyeOffIcon, GoogleIcon, GitHubIcon } from '../icons/FormIcons';
import { CheckIcon } from '../icons/GeneralIcons';
import { API_URL } from '../../services/api';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import { useTranslation } from 'react-i18next';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

function AuthErrorBox({ message }: { message: string }) {
    return (
        <div role="alert" className="mt-1.5 flex items-center gap-2 rounded-lg bg-error/10 px-3 py-2 text-[12.5px] font-medium leading-[1.4] text-error app-dark:text-primary app-dark:font-bold">
            <svg
                aria-hidden="true"
                className="h-4 w-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <circle cx="12" cy="12" r="10" />
                <path d="m15 9-6 6" />
                <path d="m9 9 6 6" />
            </svg>
            <span>{message}</span>
        </div>
    );
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
    const [isSignUp, setIsSignUp] = useState(false);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(true);
    const [emailError, setEmailError] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
    const [forgotPasswordEmailError, setForgotPasswordEmailError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [messageType, setMessageType] = useState<'signup' | 'reset' | null>(null);
    const [resendLoading, setResendLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
    const [oauthLoading, setOauthLoading] = useState<'google' | 'github' | null>(null);

    const { signIn, signUp, signInWithOAuth } = useAuth();

    const { t } = useTranslation();

    const clearMessages = () => {
        setError(null);
        setMessage(null);
        setMessageType(null);
        setPasswordError(null);
        setConfirmPasswordError(null);
        setForgotPasswordEmailError(null);
    };

    const handleClose = () => {
        clearMessages();
        onClose();
    };

    const dialogRef = useDialogAccessibility(handleClose);

    if (!isOpen) return null;

    const authFormError = error || emailError || passwordError || confirmPasswordError;
    const forgotFormError = forgotPasswordEmailError;

    const validateEmail = (value: string): boolean => {
        if (!value) {
            setEmailError(t('auth.errors.emailRequired'));
            return false;
        }
        if (!value.includes('@') || !value.includes('.')) {
            setEmailError(t('auth.errors.validEmail'));
            return false;
        }
        return true;
    };

    const validatePassword = (value: string): boolean => {
        if (!value) {
            setPasswordError(t('auth.errors.passwordRequired'));
            return false;
        }
        if (value.length < 6) {
            setPasswordError(t('auth.errors.passwordMin'));
            return false;
        }
        return true;
    };

    const validateConfirmPassword = (value: string): boolean => {
        if (!value) {
            setConfirmPasswordError(t('auth.errors.confirmPasswordRequired'));
            return false;
        }
        if (value !== password) {
            setConfirmPasswordError(t('auth.errors.passwordsMatch'));
            return false;
        }
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearMessages();
        setEmailError(null);
        setPasswordError(null);
        setConfirmPasswordError(null);

        // Validate all fields simultaneously
        const isEmailValid = validateEmail(email);
        const isPasswordValid = validatePassword(password);
        const isConfirmPasswordValid = isSignUp ? validateConfirmPassword(confirmPassword) : true;

        if (!isEmailValid || !isPasswordValid || !isConfirmPasswordValid) {
            return;
        }

        setLoading(true);

        try {
            if (isSignUp) {
                // Check email availability first
                try {
                    const emailCheckRes = await fetch(
                        `${API_URL}/auth/check-email?email=${encodeURIComponent(email)}`
                    );
                    const emailCheckData = await emailCheckRes.json();
                    if (!emailCheckData.available) {
                        setEmailError(t('auth.errors.emailExists'));
                        setLoading(false);
                        return;
                    }
                } catch {
                    // If check fails, proceed with signup (Supabase will handle it)
                }

                const { error } = await signUp(email, password);
                if (error) {
                    if (error.message.toLowerCase().includes('email')) {
                        setEmailError(error.message);
                    } else if (error.message.toLowerCase().includes('password')) {
                        setPasswordError(error.message);
                    } else {
                        setError(error.message);
                    }
                } else {
                    setMessageType('signup');
                    setMessage(t('auth.messages.checkEmailConfirmation'));
                }
            } else {
                const { error } = await signIn(email, password, rememberMe);
                if (error) {
                    setError(error.message === 'Invalid login credentials'
                        ? t('auth.errors.incorrectCredentials')
                        : error.message);
                } else {
                    handleClose();
                }
            }
        } catch {
            setError(t('auth.errors.unexpectedError'));
        } finally {
            setLoading(false);
        }
    };

    const handleOAuthClick = async (provider: 'google' | 'github') => {
        setError(null);
        setOauthLoading(provider);
        try {
            await signInWithOAuth(provider);
        } catch {
            setError(t('auth.errors.unableToSignIn', {provider}));
        } finally {
            setOauthLoading(null);
        }
    };

    const handleForgotPassword = async () => {
        if (!forgotPasswordEmail) {
            setForgotPasswordEmailError(t('auth.errors.emailRequired')); 
            return;
        }
        if (!forgotPasswordEmail.includes('@')) {
            setForgotPasswordEmailError(t('auth.errors.validEmail'));
            return;
        }
        setLoading(true);
        setForgotPasswordEmailError(null);
        try {
            const response = await fetch(`${API_URL}/auth/password-reset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: forgotPasswordEmail,
                    redirectTo: `${window.location.origin}/`,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                setForgotPasswordEmailError(data.error || t('auth.errors.unexpectedError'));
                return;
            }

            setMessageType('reset');
            setMessage(t('auth.messages.resetLinkSent'));
        } catch {
            setForgotPasswordEmailError(t('auth.errors.unexpectedError'));
        } finally {
            setLoading(false);
        }
    };

    const handleResendEmail = async () => {
        const targetEmail = messageType === 'reset' ? forgotPasswordEmail : email;
        if (!targetEmail) {
            setError(t('auth.errors.emailRequired'));
            return;
        }

        setResendLoading(true);
        setError(null);

        try {
            if (messageType === 'reset') {
                const response = await fetch(`${API_URL}/auth/password-reset`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: targetEmail,
                        redirectTo: `${window.location.origin}/`,
                    }),
                });
                if (!response.ok) throw new Error(t('auth.errors.unexpectedError'));
                setMessage(t('auth.messages.resetLinkSent'));
            } else {
                const { error } = await supabase.auth.resend({
                    type: 'signup',
                    email: targetEmail,
                    options: {
                        emailRedirectTo: window.location.origin,
                    },
                });
                if (error) throw error;
                setMessage(t('auth.messages.checkEmailConfirmation'));
            }
        } catch (resendError) {
            setError(resendError instanceof Error ? resendError.message : t('auth.errors.unexpectedError'));
        } finally {
            setResendLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[1200] flex items-center justify-center px-4">
            <div aria-hidden="true" className="absolute inset-0 bg-black/30" onClick={handleClose} />

            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="auth-title"
                aria-describedby={message ? 'auth-message-description' : isForgotPassword ? 'auth-reset-description' : undefined}
                tabIndex={-1}
                className="relative max-h-[calc(100vh-3rem)] w-full max-w-[340px] overflow-y-auto rounded-xl bg-surface p-5 shadow-xl focus:outline-none"
            >
                {!message && (
                    <CloseButton onClick={handleClose} size="lg" className="absolute top-4 right-4" />
                )}

                {message ? (
                    <div className="text-center">
                        <h2 id="auth-title" className="text-xl font-bold text-text mb-2">{t('auth.emailCheck.title')}</h2>
                        <p id="auth-message-description" className="text-sm text-text-secondary mb-6">{t('auth.emailCheck.message', { email: email || forgotPasswordEmail })}</p>
                        {error && <Alert variant="error" header={t('auth.errors.resendEmailFailed')} onClose={() => setError(null)} className="mb-4">{error}</Alert>}
                        <div className="flex gap-3">
                            <Button onClick={handleResendEmail} variant="secondary" isLoading={resendLoading} className="flex-1">{t('auth.buttons.resend')}</Button>
                            <Button onClick={handleClose} className="flex-1">{t('auth.buttons.done')}</Button>
                        </div>
                    </div>
                ) : (
                <>
                <h2 id="auth-title" className="text-2xl font-bold text-text mb-6">
                    {isForgotPassword ? t('auth.resetPassword.title') : isSignUp ? t('auth.signUp.title') : t('auth.signIn.title')}
                </h2>

                {isForgotPassword ? (
                    <>
                        <p id="auth-reset-description" className="text-sm text-text-secondary mb-6">
                            {t('auth.resetPassword.description')}
                        </p>
                        <form onSubmit={(e) => { e.preventDefault(); handleForgotPassword(); }} className="space-y-4" noValidate>
                            <Input
                                type="email"
                                name="forgot-password-email"
                                autoComplete="email"
                                label={t('auth.fields.email')}

                                value={forgotPasswordEmail}
                                onChange={(e) => { setForgotPasswordEmail(e.target.value); setForgotPasswordEmailError(null); }}
                                required
                                autoFocus
                            />
                            {forgotFormError && <AuthErrorBox message={forgotFormError} />}
                            <Button type="submit" isLoading={loading} className="w-full">{t('auth.buttons.resetPassword')}</Button>
                            <p className="text-center text-sm text-text-secondary">
                                <button
                                    type="button"
                                    onClick={() => { setIsForgotPassword(false); clearMessages(); }}
                                    className="text-primary-contrast app-dark:text-primary hover:underline font-medium"
                                >
                                    {t('auth.buttons.backToSignIn')}
                                </button>
                            </p>
                        </form>
                    </>
                ) : (
                <>
                    {/* OAuth buttons */}
                    <div className="flex gap-3 mb-6">
                        <Button onClick={() => handleOAuthClick('google')} disabled={oauthLoading !== null} variant="secondary" className="flex-1">
                            <span className="flex items-center justify-center w-full gap-2">
                                {oauthLoading === 'google' ? <Spinner size="sm" /> : <GoogleIcon />}
                                Google
                            </span>
                        </Button>
                        <Button onClick={() => handleOAuthClick('github')} disabled={oauthLoading !== null} variant="secondary" className="flex-1">
                            <span className="flex items-center justify-center w-full gap-2">
                                {oauthLoading === 'github' ? <Spinner size="sm" /> : <GitHubIcon />}
                                GitHub
                            </span>
                        </Button>
                    </div>

                    <div 
                    aria-hidden="true" className="flex items-center gap-3 mb-6 text-sm text-text-secondary">
                        <div className="flex-1 border-t border-border-strong" />
                        <span>{t('auth.signIn.or')}</span>
                        <div className="flex-1 border-t border-border-strong" />
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                        <Input
                            type="email"
                            name="email"
                            autoComplete="email"
                            label={t('auth.fields.email')}
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                setEmailError(null);
                            }}
                            required
                        />

                        <Input
                            type={showPassword ? 'text' : 'password'}
                            name={isSignUp ? 'new-password' : 'current-password'}
                            autoComplete={isSignUp ? 'new-password' : 'current-password'}
                            label={t('auth.fields.password')}
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setPasswordError(null);
                                if (isSignUp && confirmPassword) {
                                    setConfirmPasswordError(null);
                                }
                            }}
                            required
                            minLength={6}
                            rightIcon={
                                <IconButton 
                                aria-label={t(showPassword ? 'auth.buttons.hidePassword' : 'auth.buttons.showPassword')}
                                type="button" size="sm" onClick={() => setShowPassword(!showPassword)}>
                                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                                </IconButton>
                            }
                        />

                        {isSignUp && (
                            <Input
                                type={showConfirmPassword ? 'text' : 'password'}
                                name="confirm-new-password"
                                autoComplete="new-password"
                                label={t('auth.fields.confirmPassword')}
                                value={confirmPassword}
                                onChange={(e) => {
                                    setConfirmPassword(e.target.value);
                                    setConfirmPasswordError(null);
                                }}
                                required
                                minLength={6}
                                rightIcon={
                                    <IconButton
                                        aria-label={t(showConfirmPassword ? 'auth.buttons.hidePassword' : 'auth.buttons.showPassword')}
                                        type="button" size="sm" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                                        {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                                    </IconButton>
                                }
                            />
                        )}

                        {!isSignUp && (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <label className="flex items-center cursor-pointer group">
                                    <input
                                        name="remember-me"
                                        autoComplete="off"
                                        type="checkbox"
                                        checked={rememberMe}
                                        onChange={(e) => setRememberMe(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div aria-hidden="true" className="w-4 h-4 border border-border-strong rounded peer-checked:bg-primary peer-checked:border-primary group-hover:border-primary flex items-center justify-center">
                                        {rememberMe && <CheckIcon className="w-3 h-3 text-white" />}
                                    </div>
                                    <span className="ml-2 text-sm text-text-secondary">{t('auth.buttons.rememberMe')}</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => { setIsForgotPassword(true); setForgotPasswordEmail(email); clearMessages(); }}
                                    className="self-start text-sm text-text-secondary hover:underline sm:self-auto sm:text-right"
                                >
                                    {t('auth.signIn.forgotPassword')}
                                </button>
                            </div>
                        )}

                        {authFormError && <AuthErrorBox message={authFormError} />}
                        <Button type="submit" isLoading={loading} className="w-full">
                            {isSignUp ? t('auth.buttons.signUp') : t('auth.buttons.signIn')}
                        </Button>
                    </form>

                    <p className="mt-4 text-center text-sm text-text-secondary">
                        {isSignUp ? t('auth.signUp.haveAccount') : t('auth.signIn.dontHaveAccount')}{' '}
                        <button
                            onClick={() => { setIsSignUp(!isSignUp); clearMessages(); }}
                            className="text-primary-contrast app-dark:text-primary hover:underline font-medium"
                        >
                            {isSignUp ? t('auth.buttons.signIn') : t('auth.buttons.signUp')}
                        </button>
                    </p>
                </>
                )}
                </>
                )}
            </div>
        </div>,
        document.body
    );
}
