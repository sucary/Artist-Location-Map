import type { HTMLAttributes, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { useTranslation } from 'react-i18next';

const alertVariants = cva(
    'rounded-lg px-3 py-2',
    {
        variants: {
            variant: {
                error: 'bg-[rgba(220,38,38,0.1)]',
                success: 'bg-success/10',
                warning: 'bg-warning/10',
                info: 'bg-primary/10',
            },
        },
        defaultVariants: {
            variant: 'info',
        },
    }
);

const alertAccentClasses = {
    error: 'text-[rgb(220,38,38)]',
    success: 'text-success',
    warning: 'text-warning',
    info: 'text-primary-contrast app-dark:text-primary-text-dark',
} as const;

const alertIcons = {
    error: (
        <>
            <circle cx="12" cy="12" r="10" />
            <path d="m15 9-6 6" />
            <path d="m9 9 6 6" />
        </>
    ),
    success: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="m8.5 12.5 2.25 2.25L15.5 10" />
        </>
    ),
    warning: (
        <>
            <path d="M12 3 2.8 19a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L12 3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
        </>
    ),
    info: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8h.01" />
            <path d="M11 12h1v4h1" />
        </>
    ),
} as const;

export interface AlertProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
    children: ReactNode;
    className?: string;
    header?: ReactNode;
    hideIcon?: boolean;
    onClose?: () => void;
}

export function Alert({ variant, header, children, className, hideIcon = false, onClose, ...props }: AlertProps) {
    const activeVariant = variant ?? 'info';
    const { t } = useTranslation();

    return (
        <div
            role={activeVariant === 'success' ? 'status' : 'alert'}
            {...props}
            className={cn(
                alertVariants({ variant: activeVariant }),
                'flex items-start gap-2 text-[12.5px] font-medium leading-[1.4]',
                alertAccentClasses[activeVariant],
                className
            )}
        >
            {!hideIcon && (
                <svg
                    aria-hidden="true"
                    className="mt-px h-4 w-4 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    {alertIcons[activeVariant]}
                </svg>
            )}
            <div className="min-w-0 flex-1">
                {header ? (
                    <>
                        <span>{header}</span>
                        {children && <span> {children}</span>}
                    </>
                ) : (
                    children
                )}
            </div>
            {onClose && (
                <button
                    type="button"
                    onClick={onClose}
                    className="shrink-0 text-text-muted opacity-70 transition-opacity hover:opacity-100"
                    aria-label={t('common.dismiss')}
                >
                    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            )}
        </div>
    );
}
