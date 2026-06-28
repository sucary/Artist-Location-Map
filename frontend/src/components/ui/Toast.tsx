import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircleIcon } from '../icons/GeneralIcons';

export interface ToastProps {
    message: string;
    /** Auto-dismiss delay in ms. */
    duration?: number;
    onDismiss: () => void;
}

// Lightweight transient notification shown near the top of the viewport.
// onDismiss should be a stable callback so the auto-dismiss timer isn't reset
// on every parent render.
export function Toast({ message, duration = 2500, onDismiss }: ToastProps) {
    useEffect(() => {
        const timer = window.setTimeout(onDismiss, duration);
        return () => window.clearTimeout(timer);
    }, [duration, message, onDismiss]);

    return createPortal(
        <div className="pointer-events-none fixed inset-x-2 top-36 z-[2000] flex justify-center sm:inset-x-auto sm:bottom-28 sm:left-1/2 sm:top-auto sm:-translate-x-1/2">
            <div
                role="status"
                aria-live="polite"
                className="pointer-events-auto flex max-w-full items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text shadow-md"
            >
                <CheckCircleIcon className="h-5 w-5 shrink-0 text-text-secondary" />
                <span className="truncate">{message}</span>
            </div>
        </div>,
        document.body,
    );
}
