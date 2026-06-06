import { useEffect, useRef } from 'react';

const focusableSelector = [
    'button:not(:disabled)',
    '[href]',
    'input:not(:disabled)',
    'select:not(:disabled)',
    'textarea:not(:disabled)',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function useDialogAccessibility<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
    const dialogRef = useRef<T>(null);
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

        if (!dialog.contains(document.activeElement)) {
            const initialFocus = dialog.querySelector<HTMLElement>('[autofocus], [data-autofocus="true"]') ?? dialog.querySelector<HTMLElement>(focusableSelector);
            // Prefer actionable focus while keeping empty dialogs reachable
            (initialFocus ?? dialog).focus();
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
                const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
                    .filter((element) => element.offsetParent !== null || element === document.activeElement);
                if (focusable.length === 0) {
                    e.preventDefault();
                    dialog.focus();
                    return;
                }

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
