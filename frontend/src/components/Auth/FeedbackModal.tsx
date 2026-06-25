import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import { Button, CloseButton } from '../ui';
import { submitFeedback } from '../../services/api';

interface FeedbackModalProps {
    onClose: () => void;
}

// Rendered only while open, so each launch starts from a clean form.
export function FeedbackModal({ onClose }: FeedbackModalProps) {
    const { t } = useTranslation();
    const dialogRef = useDialogAccessibility<HTMLElement>(onClose);
    const titleId = useId();
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [submitted, setSubmitted] = useState(false);
    const closeTimerRef = useRef<number | undefined>(undefined);

    useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        const trimmed = message.trim();
        if (!trimmed || isSubmitting) return;

        setIsSubmitting(true);
        setError(null);
        try {
            await submitFeedback(trimmed);
            setSubmitted(true);
            closeTimerRef.current = window.setTimeout(onClose, 1400);
        } catch {
            setError(t('feedback.error'));
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center px-4">
            <div
                aria-hidden="true"
                className="absolute inset-0 bg-black/30"
                onClick={isSubmitting ? undefined : onClose}
            />
            <section
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="relative w-[calc(100vw-1rem)] max-w-sm rounded-xl border border-border bg-surface p-4 shadow-xl focus:outline-none sm:w-96"
            >
                <div className="flex items-center justify-between">
                    <h2 id={titleId} className="text-base font-semibold text-text">
                        {t('feedback.title')}
                    </h2>
                    <CloseButton onClick={onClose} size="md" />
                </div>

                {submitted ? (
                    <p role="status" className="mt-4 text-sm text-text-secondary">
                        {t('feedback.success')}
                    </p>
                ) : (
                    <form onSubmit={(event) => { void handleSubmit(event); }} className="mt-3">
                        <p className="mb-2 text-sm text-text-secondary">{t('feedback.description')}</p>
                        <textarea
                            autoFocus
                            value={message}
                            onChange={(event) => setMessage(event.target.value)}
                            rows={5}
                            maxLength={2000}
                            placeholder={t('feedback.placeholder')}
                            className="w-full resize-y rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary"
                        />
                        {error && (
                            <p role="alert" className="mt-2 text-sm font-medium text-error">{error}</p>
                        )}
                        <div className="mt-3 flex justify-end gap-2">
                            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
                                {t('common.cancel')}
                            </Button>
                            <Button type="submit" disabled={!message.trim() || isSubmitting} isLoading={isSubmitting}>
                                {t('feedback.submit')}
                            </Button>
                        </div>
                    </form>
                )}
            </section>
        </div>
    );
}
