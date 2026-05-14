import type { ReactNode } from 'react';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import { cn } from '../../lib/utils';
import { Button } from './Button';
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
    isLoading?: boolean;
    dimBackdrop?: boolean;
    onConfirm: () => void;
    onCancel?: () => void;
}

const variantLabelClasses: Record<ConfirmDialogVariant, string> = {
    default: 'text-primary-contrast app-dark:text-primary-text-dark',
    danger: 'text-[rgb(220,38,38)] app-dark:text-primary app-dark:font-bold',
    warning: 'text-warning',
    success: 'text-success',
    error: 'text-[rgb(220,38,38)] app-dark:text-primary app-dark:font-bold',
};

const confirmButtonClasses: Record<ConfirmDialogVariant, string> = {
    default: 'bg-primary-contrast hover:bg-primary-contrast-hover',
    danger: '!bg-[rgb(220,38,38)] hover:!bg-[rgb(185,28,28)]',
    warning: 'bg-warning hover:bg-warning/90',
    success: 'bg-success hover:bg-success/90',
    error: '!bg-[rgb(220,38,38)] hover:!bg-[rgb(185,28,28)]',
};

export function ConfirmDialog({
    open,
    title,
    children,
    confirmLabel,
    cancelLabel,
    variant = 'default',
    isLoading = false,
    dimBackdrop = true,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const { t } = useTranslation();
    const dialogRef = useDialogAccessibility(onCancel || onConfirm);
    const effectiveConfirmLabel = confirmLabel ?? t('common.ok');

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center px-4">
            <div
                aria-hidden="true"
                className={cn('absolute inset-0', dimBackdrop && 'bg-black/25')}
                onClick={isLoading ? undefined : onCancel || onConfirm}
            />
            <section
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                tabIndex={-1}
                className="relative w-[calc(100vw-1rem)] max-w-80 rounded-lg border border-border bg-surface p-4 shadow-xl focus:outline-none sm:w-80"
            >
                <h2 id="confirm-dialog-title" className={cn('text-base font-semibold', variantLabelClasses[variant])}>
                    {title}
                </h2>
                <div className="mt-3 text-sm leading-5 text-text-secondary">
                    {children}
                </div>
                <div className="mt-4 flex gap-3">
                    {cancelLabel && onCancel && (
                        <Button
                            type="button"
                            variant="secondary"
                            className="flex-1"
                            onClick={onCancel}
                            disabled={isLoading}
                        >
                            {cancelLabel}
                        </Button>
                    )}
                    <Button
                        type="button"
                        className={cn(confirmButtonClasses[variant], cancelLabel && onCancel ? 'flex-1' : 'w-full')}
                        isLoading={isLoading}
                        onClick={onConfirm}
                    >
                        {effectiveConfirmLabel}
                    </Button>
                </div>
            </section>
        </div>
    );
}
