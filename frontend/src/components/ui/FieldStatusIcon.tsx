import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type FieldStatus = 'success' | 'warning';

interface FieldStatusIconProps {
    status?: FieldStatus;
    label: string;
    className?: string;
}

const statusClasses: Record<FieldStatus, string> = {
    success: 'text-success',
    warning: 'text-warning',
};

const statusIcons: Record<FieldStatus, ReactNode> = {
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
};

export function FieldStatusIcon({ status, label, className }: FieldStatusIconProps) {
    if (!status) return null;

    return (
        <span className={cn('inline-flex h-6 w-6 items-center justify-center', statusClasses[status], className)} title={label}>
            <span className="sr-only">{label}</span>
            <svg
                aria-hidden="true"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                {statusIcons[status]}
            </svg>
        </span>
    );
}
