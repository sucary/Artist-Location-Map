import type { ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { useTranslation } from 'react-i18next';

const closeButtonVariants = cva(
    `rounded text-text-muted hover:text-primary-contrast app-dark:hover:text-primary
    hover:bg-surface-muted transition-colors
    focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary focus-visible:ring-offset-surface`,
    {
        variants: {
            size: {
                sm: 'p-1',
                md: 'p-1.5',
                lg: 'p-2',
            },
        },
        defaultVariants: {
            size: 'md',
        },
    }
);

const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
};

export interface CloseButtonProps
    extends ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof closeButtonVariants> {}

export function CloseButton({ size = 'md', className, ...props }: CloseButtonProps) {
    const { t } = useTranslation();

    return (
        <button
            type="button"
            aria-label={props['aria-label'] ?? t('common.close')}
            className={cn(closeButtonVariants({ size }), className)}
            {...props}
        >
            <svg
                aria-hidden="true"
                className={iconSizes[size || 'md']}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                />
            </svg>
        </button>
    );
}
