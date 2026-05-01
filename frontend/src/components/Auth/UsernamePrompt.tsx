import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Input, Button } from '../ui';
import { API_URL } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import { useTranslation } from 'react-i18next';

interface UsernamePromptProps {
    onComplete: () => void;
}

export function UsernamePrompt({ onComplete }: UsernamePromptProps) {
    const noop = useCallback(() => {}, []);
    const dialogRef = useDialogAccessibility(noop);
    const { profile } = useAuth();
    const [username, setUsername] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [availableUsername, setAvailableUsername] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(false);
    const { t } = useTranslation();
    const availabilityTimeoutRef = useRef<number | null>(null);

    // Validate on blur/submit; do not mutate user input while typing.
    const hasValidUsernameFormat = (value: string): boolean => (
        value.length >= 1 &&
        value.length <= 16 &&
        /^[a-zA-Z0-9_]+$/.test(value)
    );

    const validateUsername = (value: string): boolean => {
        if (value.length < 1) {
            setError(t('auth.errors.userNameMin'));
            return false;
        }
        if (value.length > 16) {
            setError(t('auth.errors.userNameMax'));
            return false;
        }
        if (!/^[a-zA-Z0-9_]+$/.test(value)) {
            setError(t('auth.errors.userNamePattern'));
            return false;
        }
        setError(null);
        return true;
    };

    const checkAvailability = async (value: string) => {
        if (!hasValidUsernameFormat(value)) return;
        // Prevent availability helper flicker on repeated blur.
        if (availableUsername === value) return;

        setChecking(true);
        try {
            const res = await fetch(`${API_URL}/auth/check-username?username=${value}`);
            const data = await res.json();
            if (!data.available) {
                setError(t('auth.errors.userNameTaken'));
                setAvailableUsername(null);
            } else {
                setAvailableUsername(value);
            }
        } finally {
            setChecking(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateUsername(username) || checking) return;

        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/auth/set-username`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
                },
                body: JSON.stringify({ username })
            });

            if (!res.ok) {
                const data = await res.json();
                setError(data.error || t('auth.errors.unableToSaveUsername'));
                return;
            }

            onComplete();
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
    return () => {
        if (availabilityTimeoutRef.current !== null) {
            window.clearTimeout(availabilityTimeoutRef.current);
        }
    };
}, []);

    const isAvailable = !error && username.length >= 1 && availableUsername === username && !checking;

    return (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center">
            <div aria-hidden="true" className="absolute inset-0 bg-black/50" />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="username-prompt-title"
                tabIndex={-1}
                className="relative bg-surface rounded-lg shadow-xl w-full max-w-sm mx-4 p-6 focus:outline-none"
            >
                <h2 id="username-prompt-title" className="text-xl font-bold text-text mb-2">{t('auth.userNamePrompt.title')}</h2>
                <p className="text-sm text-text-secondary mb-4">
                    {t('auth.userNamePrompt.description')}
                    <br />
                    {t('auth.userNamePrompt.subdescription')}
                </p>
                {profile?.isRejected && (
                    <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2 mb-4">
                        {t('auth.userNamePrompt.notApprovedNotice')}
                    </p>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        {/* Plain text prevents label-click refocus. */}
                        <div className="block text-sm font-medium text-text mb-1">
                            {t('auth.userNamePrompt.usernameLabel')}
                        </div>
                        <Input
                            aria-label={t('auth.userNamePrompt.usernameLabel')}
                            type="text"
                            value={username}
                            onChange={(e) => {
                                const value = e.target.value;
                                setUsername(value);
                                setError(null);
                                if (availableUsername && availableUsername !== value) {
                                    setAvailableUsername(null);
                                }
                                if (availabilityTimeoutRef.current !== null) {
                                    window.clearTimeout(availabilityTimeoutRef.current);
                                }
                                if (hasValidUsernameFormat(value)) {
                                    availabilityTimeoutRef.current = window.setTimeout(() => {
                                        checkAvailability(value);
                                    }, 800);
                                }
                            }}
                            onBlur={() => {
                                if (!username) {
                                    setError(null);
                                    return;
                                }
                                if (validateUsername(username)) {
                                    checkAvailability(username);
                                }
                            }}
                            placeholder={t('auth.userNamePrompt.usernamePlaceholder')}
                            maxLength={16}
                            error={error || undefined}
                            helperText={isAvailable ? t('auth.userNamePrompt.usernameAvailable') : undefined}
                        />
                    </div>

                    <Button
                        type="submit"
                        isLoading={loading}
                        disabled={loading || checking}
                        className="w-full"
                    >
                        {t('auth.userNamePrompt.submit')}
                    </Button>
                </form>
            </div>
        </div>
    );
}
