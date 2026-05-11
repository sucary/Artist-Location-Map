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

function UsernamePromptError({ message }: { message: string }) {
    return (
        <div role="alert" className="mt-1.5 flex items-center gap-2 rounded-lg bg-error/10 px-3 py-2 text-[12.5px] font-medium leading-[1.4] text-error">
            <svg
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-[#ef4444]"
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

function UsernamePromptSuccess({ message }: { message: string }) {
    return (
        <div role="status" className="mt-1.5 flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-[12.5px] font-medium leading-[1.4] text-success">
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
                <path d="m8.5 12.5 2.25 2.25L15.5 10" />
            </svg>
            <span>{message}</span>
        </div>
    );
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
    const availabilityCacheRef = useRef<Map<string, boolean>>(new Map());
    const availabilityRequestRef = useRef(0);
    const usernameRef = useRef(username);
    const normalizeUsername = (value: string) => value.trim().toLowerCase();

    useEffect(() => {
        usernameRef.current = username;
    }, [username]);

    // Usernames are canonical lowercase profile slugs.
    const hasValidUsernameFormat = (value: string): boolean => (
        value.length >= 3 &&
        value.length <= 32 &&
        /^[a-z0-9_]+$/.test(value)
    );

    const validateUsername = (value: string): boolean => {
        if (value.length < 3) {
            setError(t('auth.errors.userNameMin'));
            return false;
        }
        if (value.length > 32) {
            setError(t('auth.errors.userNameMax'));
            return false;
        }
        if (!/^[a-z0-9_]+$/.test(value)) {
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

        const normalizedValue = normalizeUsername(value);
        const cachedAvailability = availabilityCacheRef.current.get(normalizedValue);
        if (cachedAvailability !== undefined) {
            if (!cachedAvailability) {
                setError(t('auth.errors.userNameTaken'));
                setAvailableUsername(null);
            } else {
                setAvailableUsername(value);
            }
            return;
        }

        const requestId = ++availabilityRequestRef.current;
        setChecking(true);
        try {
            const res = await fetch(`${API_URL}/auth/check-username?username=${encodeURIComponent(normalizedValue)}`);
            const data = await res.json();
            if (requestId !== availabilityRequestRef.current || value !== usernameRef.current) return;

            availabilityCacheRef.current.set(normalizedValue, !!data.available);
            if (!data.available) {
                setError(t('auth.errors.userNameTaken'));
                setAvailableUsername(null);
            } else {
                setAvailableUsername(value);
            }
        } finally {
            if (requestId === availabilityRequestRef.current) {
                setChecking(false);
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const normalizedUsername = normalizeUsername(username);
        if (!validateUsername(normalizedUsername) || checking) return;

        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/auth/set-username`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
                },
                body: JSON.stringify({ username: normalizedUsername })
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
        <div className="fixed inset-0 z-[1200] pointer-events-none">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="username-prompt-title"
                tabIndex={-1}
                className="absolute right-2 top-16 w-[calc(100vw-1rem)] max-w-[340px] rounded-lg bg-surface p-5 shadow-xl pointer-events-auto focus:outline-none"
            >
                <h2 id="username-prompt-title" className="text-xl font-bold text-text mb-2">{t('auth.userNamePrompt.title')}</h2>
                <p className="text-sm text-text-secondary mb-4">
                    {t('auth.userNamePrompt.description')}
                    <br />
                    {t('auth.userNamePrompt.subdescription')}
                </p>
                {profile?.isRejected && (
                    <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-md px-3 py-2 mb-4">
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
                            name="username"
                            autoComplete="username"
                            autoCorrect="off"
                            spellCheck={false}
                            value={username}
                            onChange={(e) => {
                                const value = e.target.value;
                                setUsername(normalizeUsername(value));
                                setError(null);
                                if (availableUsername && availableUsername !== value) {
                                    setAvailableUsername(null);
                                }
                                if (availabilityTimeoutRef.current !== null) {
                                    window.clearTimeout(availabilityTimeoutRef.current);
                                }
                                availabilityRequestRef.current += 1;
                                setChecking(false);
                                if (hasValidUsernameFormat(value)) {
                                    availabilityTimeoutRef.current = window.setTimeout(() => {
                                        checkAvailability(value);
                                    }, 350);
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
                            maxLength={32}
                        />
                        {error && <UsernamePromptError message={error} />}
                        {isAvailable && <UsernamePromptSuccess message={t('auth.userNamePrompt.usernameAvailable')} />}
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
