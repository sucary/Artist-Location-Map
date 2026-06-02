import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

// Shared button variants for primary, secondary, and low-emphasis actions

const buttonVariants = cva(
    `font-medium rounded-lg transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed 
    focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary focus-visible:ring-offset-surface`,
    {
        variants: {
            variant: {
                primary: 'bg-primary-contrast text-white hover:bg-primary-contrast-hover border border-transparent',
                secondary: 'bg-[#F3F4F6] text-text border border-transparent hover:bg-[#E5E7EB] app-dark:bg-[#2C2C2E] app-dark:text-text app-dark:hover:bg-[#3A3A3C]',
                ghost: 'bg-transparent text-text-muted hover:text-primary-contrast app-dark:hover:text-primary border-none',
            },
            size: {
                sm: 'px-3 py-1 text-xs',
                md: 'px-4 py-2 text-sm',
                lg: 'px-6 py-3 text-base',
            },
        },
        defaultVariants: {
            variant: 'primary',
            size: 'md',
        },
    }
);

export interface ButtonProps
    extends ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    isLoading?: boolean;
    children: ReactNode;
}

export function Button({
    variant,
    size,
    isLoading = false,
    disabled,
    className,
    children,
    ...props
}: ButtonProps) {
    return (
        <button
            aria-busy={isLoading}
            className={cn(buttonVariants({ variant, size }), className)}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                    <svg aria-hidden="true" className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {children}
                </span>
            ) : (
                children
            )}
        </button>
    );
}
