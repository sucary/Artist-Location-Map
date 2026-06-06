import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const iconButtonVariants = cva(
    `text-text-muted hover:text-primary-contrast app-dark:hover:text-primary
    transition-colors rounded-full
    focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary focus-visible:ring-offset-surface`,
    {
        variants: {
            size: {
                sm: 'p-1',
                md: 'p-2',
                lg: 'p-3',
            },
        },
        defaultVariants: {
            size: 'md',
        },
    }
);

export interface IconButtonProps
    extends ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof iconButtonVariants> {
            'aria-label': string;
            children: ReactNode;
}

export function IconButton({
    children,
    size,
    className,
    type,
    ...props
}: IconButtonProps) {
    return (
        <button
            type={type ?? 'button'}
            className={cn(iconButtonVariants({ size }), className)}
            {...props}
        >
            {children}
        </button>
    );
}
