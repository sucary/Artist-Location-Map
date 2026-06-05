import { useEffect, useRef } from 'react';

export function useDialogAccessibility(onClose: () => void) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    const previousFocusRef = useRef<HTMLElement | null>(
        typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null
    );

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        const dialog = dialogRef.current;
        const previousFocus = previousFocusRef.current;
        if (!dialog) return;

        // Preserve explicit autofocus inside the modal.
        if (!dialog.contains(document.activeElement)) {
            dialog.focus();
        }

        return () => {
            // Restore keyboard context after modal teardown.
            if (previousFocus?.isConnected) {
                previousFocus.focus({ preventScroll: true });
            }
        };
    }, []);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCloseRef.current();
                return;
            }

            if (e.key === 'Tab') {
                const focusable = dialog.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                const first = focusable[0];
                const last = focusable[focusable.length - 1];

                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    return dialogRef;
}
