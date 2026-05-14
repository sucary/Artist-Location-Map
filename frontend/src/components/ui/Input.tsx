import type { InputHTMLAttributes, ReactNode, } from 'react';
import { forwardRef, useId } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';


const inputVariants = cva(
    'w-full px-3 py-2 bg-surface border rounded-md text-sm text-text placeholder:text-text-muted focus:outline-none transition-colors',
    {
        variants: {
            state: {
                default: 'border-border-strong focus:border-primary focus:ring-1 focus:ring-inset focus:ring-primary',
                error: 'border-error focus:border-error focus:ring-1 focus:ring-inset focus:ring-error',
            },
            hasLeftIcon: {
                true: 'pl-9',
            },
            hasRightIcon: {
                true: 'pr-7',
            },
        },
        defaultVariants: {
            state: 'default',
        },
    }
);

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    helperText?: string;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, helperText, leftIcon, rightIcon, className, ...props }, ref) => {
        const generatedId = useId();
        const inputId = props.id || generatedId;
        const errorId = `${inputId}-error`;
        const helperId = `${inputId}-helper`;
        return (
            <div className="w-full">
                {label && (
                    <label htmlFor={inputId} className="inline-block w-fit max-w-full text-sm font-medium text-text mb-1">
                        {label}
                    </label>
                )}
                <div className="relative">
                    {leftIcon && (
                        <div aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                            {leftIcon}
                        </div>
                    )}
                    <input
                        ref={ref}
                        id={inputId}
                        aria-describedby={error ? errorId : helperText ? helperId : undefined}
                        aria-invalid={!!error}
                        className={cn(
                            inputVariants({
                                state: error ? 'error' : 'default',
                                hasLeftIcon: !!leftIcon,
                                hasRightIcon: !!rightIcon,
                            }),
                            className
                        )}
                        {...props}
                    />
                    {rightIcon && (
                        <div aria-hidden="true" className="absolute right-3 inset-y-0 flex items-center text-text-muted">
                            {rightIcon}
                        </div>
                    )}
                </div>
                {error && (
                    <p id={errorId} role="alert" className="text-xs text-error mt-1 app-dark:text-primary app-dark:font-bold">{error}</p>
                )}
                {helperText && !error && (
                    <p id={helperId} className="text-xs text-text-secondary mt-1">{helperText}</p>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';
