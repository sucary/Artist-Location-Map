import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

// Anchors a portaled popup (rendered into document.body with position: fixed)
// to a field inside a scrollable form. The popup opens below the field when
// there is room, otherwise above it, always starting at the field's edge and
// never covering it. It fills the available space toward the page edge,
// scrolling internally only when its content exceeds that space. Scrolling the
// form behind an open popup closes it (via onScrollAway).

interface UseAnchoredPopupOptions {
    isOpen: boolean;
    anchorRef: RefObject<HTMLElement | null>;
    popupRef: RefObject<HTMLElement | null>;
    /** Fixed width in px, or 'anchor' to match the anchor's width. */
    width: number | 'anchor';
    /** Minimum width when width is 'anchor'. */
    minWidth?: number;
    /** Horizontal alignment of the popup relative to the anchor. */
    align?: 'left' | 'right';
    /** Hard cap on the popup height (e.g. for long scrollable lists). */
    maxHeightCap?: number;
    /** Distance between the anchor and the popup. */
    gap?: number;
    /** Minimum distance to keep from the viewport edges. */
    margin?: number;
    /** Changing this re-measures and repositions (e.g. content height changes). */
    recomputeKey?: unknown;
    /** Called when the user scrolls the surrounding form behind an open popup. */
    onScrollAway?: () => void;
}

interface AnchoredPopupPosition {
    top: number;
    left: number;
    width: number;
    maxHeight: number;
}

function getScrollableAncestor(node: HTMLElement | null): HTMLElement | null {
    let current: HTMLElement | null = node?.parentElement ?? null;
    while (current && current !== document.body) {
        const { overflowY } = getComputedStyle(current);
        if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
            return current;
        }
        current = current.parentElement;
    }
    return null;
}

export function useAnchoredPopup({
    isOpen,
    anchorRef,
    popupRef,
    width,
    minWidth,
    align = 'left',
    maxHeightCap,
    gap = 8,
    margin = 8,
    recomputeKey,
    onScrollAway,
}: UseAnchoredPopupOptions): AnchoredPopupPosition {
    const [position, setPosition] = useState<AnchoredPopupPosition>({
        top: 0,
        left: 0,
        width: 0,
        maxHeight: 0,
    });

    // Ignore scroll-away while the surrounding form is interacted with.
    const onScrollAwayRef = useRef(onScrollAway);
    useEffect(() => {
        onScrollAwayRef.current = onScrollAway;
    }, [onScrollAway]);

    const measureAndPlace = useCallback(() => {
        const anchor = anchorRef.current;
        const popup = popupRef.current;
        if (!anchor || !popup) return;

        const rect = anchor.getBoundingClientRect();

        // Resolve width independently of height so the popup can be measured at
        // its true width before we decide where to place it.
        let targetWidth = width === 'anchor' ? rect.width : width;
        if (minWidth) targetWidth = Math.max(targetWidth, minWidth);
        const resolvedWidth = Math.min(targetWidth, window.innerWidth - margin * 2);

        // The popup may grow downward to nearly the bottom of the page; an
        // optional cap (used by some hosts) limits it further.
        const viewportMax = window.innerHeight - margin * 2;
        const heightCap = maxHeightCap ? Math.min(maxHeightCap, viewportMax) : viewportMax;

        // Apply width and height cap before measuring so offsetHeight reflects
        // what will actually render.
        popup.style.width = `${resolvedWidth}px`;
        popup.style.maxHeight = `${heightCap}px`;
        const contentHeight = popup.offsetHeight;

        const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
        const spaceAbove = rect.top - gap - margin;

        // Open below the field by default; flip above when below can't fit the
        // popup but above can. If neither fits, use whichever side is larger and
        // let the popup scroll internally. Either way it starts at the field's
        // edge and never covers it.
        let placeAbove: boolean;
        if (contentHeight <= spaceBelow) {
            placeAbove = false;
        } else if (contentHeight <= spaceAbove) {
            placeAbove = true;
        } else {
            placeAbove = spaceAbove > spaceBelow;
        }

        const available = placeAbove ? spaceAbove : spaceBelow;
        const maxHeight = Math.max(0, Math.min(contentHeight, available));

        const left = align === 'right'
            ? Math.min(Math.max(margin, rect.right - resolvedWidth), window.innerWidth - resolvedWidth - margin)
            : Math.min(Math.max(margin, rect.left), window.innerWidth - resolvedWidth - margin);

        const top = placeAbove
            ? rect.top - gap - maxHeight
            : rect.bottom + gap;

        setPosition({
            top,
            left,
            width: resolvedWidth,
            maxHeight,
        });
    }, [anchorRef, popupRef, width, minWidth, align, maxHeightCap, gap, margin]);

    // Position on open and whenever the measured content changes. Measuring the
    // rendered popup against live DOM layout is what a layout effect is for.
    useLayoutEffect(() => {
        if (!isOpen) return;
        measureAndPlace();
    }, [isOpen, recomputeKey, measureAndPlace]);

    // Close the popup when the user scrolls the form behind it; keep it aligned
    // on window resize.
    useEffect(() => {
        if (!isOpen) return;

        const handleScroll = (event: Event) => {
            // Scrolling inside the popup itself must not dismiss it.
            const target = event.target as Node | null;
            if (target && popupRef.current?.contains(target)) return;
            onScrollAwayRef.current?.();
        };
        const handleResize = () => measureAndPlace();
        const scrollParent = getScrollableAncestor(anchorRef.current);

        scrollParent?.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
        window.addEventListener('resize', handleResize);

        return () => {
            scrollParent?.removeEventListener('scroll', handleScroll);
            window.removeEventListener('scroll', handleScroll, { capture: true } as EventListenerOptions);
            window.removeEventListener('resize', handleResize);
        };
    }, [isOpen, anchorRef, popupRef, measureAndPlace]);

    return position;
}
