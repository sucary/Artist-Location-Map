import { useState } from 'react';
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
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
    const [oauthLoading, setOauthLoading] = useState<'google' | 'github' | null>(null);

    const { signIn, signUp, signInWithOAuth } = useAuth();

    const { t } = useTranslation();

    const clearMessages = () => {
        setError(null);
        setMessage(null);
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
        const { error } = await supabase.auth.resetPasswordForEmail(forgotPasswordEmail, {
            redirectTo: `${window.location.origin}/`,
        });
        setLoading(false);
        if (error) {
            setForgotPasswordEmailError(error.message);
        } else {
            setMessage(t('auth.messages.resetLinkSent'));
        }
    };

    return (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center">
            <div aria-hidden="true" className="absolute inset-0 bg-black/50" onClick={handleClose} />

            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="auth-title"
                tabIndex={-1}
                className="relative bg-surface rounded-lg shadow-xl w-full max-w-md mx-4 p-6 focus:outline-none"
            >
                {!message && (
                    <CloseButton onClick={handleClose} size="lg" className="absolute top-4 right-4" />
                )}

                {message ? (
                    <div className="text-center">
                        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-text-muted/10 flex items-center justify-center">
                            <div className="flex gap-1">
                                <div className="w-2 h-2 rounded-full bg-text-muted" />
                                <div className="w-2 h-2 rounded-full bg-text-muted" />
                                <div className="w-2 h-2 rounded-full bg-text-muted" />
                            </div>
                        </div>
                        <h2 id="auth-title" className="text-xl font-bold text-text mb-2">{t('auth.emailCheck.title')}</h2>
                        <p className="text-sm text-text-secondary mb-6">{t('auth.emailCheck.message', { email: email || forgotPasswordEmail })}</p>
                        <div className="flex gap-3">
                            <Button onClick={handleClose} variant="secondary" className="flex-1">{t('auth.buttons.resend')}</Button>
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
                        <p className="text-sm text-text-secondary mb-6">
                            {t('auth.resetPassword.description')}
                        </p>
                        <form onSubmit={(e) => { e.preventDefault(); handleForgotPassword(); }} className="space-y-4">
                            <Input
                                type="email"
                                label={t('auth.fields.email')}

                                value={forgotPasswordEmail}
                                onChange={(e) => { setForgotPasswordEmail(e.target.value); setForgotPasswordEmailError(null); }}
                                error={forgotPasswordEmailError || undefined}
                                required
                                autoFocus
                            />
                            <Button type="submit" isLoading={loading} className="w-full">{t('auth.buttons.resetPassword')}</Button>
                            <p className="text-center text-sm text-text-secondary">
                                <button
                                    type="button"
                                    onClick={() => { setIsForgotPassword(false); clearMessages(); }}
                                    className="text-primary hover:underline font-medium"
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
                            label={t('auth.fields.email')}
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                setEmailError(null);
                            }}
                            error={emailError || undefined}
                            required
                        />

                        <Input
                            type={showPassword ? 'text' : 'password'}
                            label={t('auth.fields.password')}
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setPasswordError(null);
                                if (isSignUp && confirmPassword) {
                                    setConfirmPasswordError(null);
                                }
                            }}
                            error={passwordError || undefined}
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
                                label={t('auth.fields.confirmPassword')}
                                value={confirmPassword}
                                onChange={(e) => {
                                    setConfirmPassword(e.target.value);
                                    setConfirmPasswordError(null);
                                }}
                                error={confirmPasswordError || undefined}
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
                            <div className="flex items-center justify-between">
                                <label className="flex items-center cursor-pointer group">
                                    <input
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
                                    className="text-sm text-text-secondary hover:underline"
                                >
                                    {t('auth.signIn.forgotPassword')}
                                </button>
                            </div>
                        )}

                        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}
                        <Button type="submit" isLoading={loading} className="w-full">
                            {isSignUp ? t('auth.buttons.signUp') : t('auth.buttons.signIn')}
                        </Button>
                    </form>

                    <p className="mt-4 text-center text-sm text-text-secondary">
                        {isSignUp ? t('auth.signUp.haveAccount') : t('auth.signIn.dontHaveAccount')}{' '}
                        <button
                            onClick={() => { setIsSignUp(!isSignUp); clearMessages(); }}
                            className="text-primary hover:underline font-medium"
                        >
                            {isSignUp ? t('auth.buttons.signIn') : t('auth.buttons.signUp')}
                        </button>
                    </p>
                </>
                )}
                </>
                )}
            </div>
        </div>
    );
}
