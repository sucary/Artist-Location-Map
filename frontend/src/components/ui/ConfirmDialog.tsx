import { useId, type ReactNode } from 'react';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import { cn } from '../../lib/utils';
import type { ButtonProps } from './Button';
import { useTranslation } from 'react-i18next';

// Confirmation dialog variants and destructive action styling

export type ConfirmDialogVariant = 'default' | 'danger' | 'warning' | 'success' | 'error';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    children: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: ConfirmDialogVariant;
    confirmButtonVariant?: ButtonProps['variant'];
    isLoading?: boolean;
    dimBackdrop?: boolean;
    onConfirm: () => void;
    onCancel?: () => void;
}

const variantLabelClasses: Record<ConfirmDialogVariant, string> = {
    default: 'text-text',
    danger: 'text-text',
    warning: 'text-text',
    success: 'text-text',
    error: 'text-text',
};

const confirmButtonClasses: Record<ConfirmDialogVariant, string> = {
    default: 'text-primary-contrast hover:bg-primary-contrast/10',
    danger: 'text-[#DC2626] hover:bg-[#DC2626]/10',
    warning: 'text-warning hover:bg-warning/10',
    success: 'text-text-secondary hover:bg-surface-muted hover:text-text',
    error: 'text-[#DC2626] hover:bg-[#DC2626]/10',
};

const actionButtonClass = 'inline-flex min-h-10 min-w-16 items-center justify-center rounded-md px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50';

export function ConfirmDialog({
    open,
    title,
    children,
    confirmLabel,
    cancelLabel,
    variant = 'default',
    confirmButtonVariant,
    isLoading = false,
    dimBackdrop = true,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const { t } = useTranslation();
    // Passive dismissal must never confirm an action.
    const handleDismiss = onCancel ?? (() => undefined);
    const dialogRef = useDialogAccessibility<HTMLElement>(handleDismiss);
    const effectiveConfirmLabel = confirmLabel ?? t('common.ok');
    const titleId = useId();
    const contentId = useId();
    const isAlertDialog = variant === 'danger' || variant === 'error';

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center px-4">
            <div
                aria-hidden="true"
                className={cn('absolute inset-0', dimBackdrop && 'bg-black/30')}
                onClick={isLoading ? undefined : handleDismiss}
            />
            <section
                ref={dialogRef}
                role={isAlertDialog ? 'alertdialog' : 'dialog'}
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={contentId}
                tabIndex={-1}
                className="relative w-[calc(100vw-1rem)] max-w-80 rounded-xl border border-border bg-surface p-4 pb-2 shadow-xl focus:outline-none sm:w-80"
            >
                <h2 id={titleId} className={cn('text-base font-semibold', variantLabelClasses[variant])}>
                    {title}
                </h2>
                <div id={contentId} className="mt-3 text-sm leading-5 text-text-secondary">
                    {children}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                    {cancelLabel && onCancel && (
                        <button
                            type="button"
                            className={cn(
                                actionButtonClass,
                                confirmButtonVariant === 'secondary'
                                    ? 'text-text-muted hover:bg-surface-muted hover:text-text'
                                    : 'text-text-secondary hover:bg-surface-muted hover:text-text'
                            )}
                            onClick={onCancel}
                            disabled={isLoading}
                        >
                            {cancelLabel}
                        </button>
                    )}
                    <button
                        type="button"
                        aria-busy={isLoading}
                        disabled={isLoading}
                        className={cn(
                            actionButtonClass,
                            confirmButtonVariant === 'secondary'
                                ? 'text-text-secondary hover:bg-surface-muted hover:text-text'
                                : confirmButtonClasses[variant]
                        )}
                        onClick={onConfirm}
                    >
                        {isLoading ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg aria-hidden="true" className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                {effectiveConfirmLabel}
                            </span>
                        ) : (
                            effectiveConfirmLabel
                        )}
                    </button>
                </div>
            </section>
        </div>
    );
}
