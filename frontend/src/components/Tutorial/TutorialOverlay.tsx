import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

export interface TutorialStep {
    target: string;
    title: string;
    body: React.ReactNode;
    waitForTarget?: boolean;
    nextStepIndex?: number;
    hideIndicator?: boolean;
}

interface TutorialOverlayProps {
    steps: TutorialStep[];
    stepIndex: number;
    onSkip: () => void;
    onNext?: (stepIndex: number) => void;
}

interface TargetBox {
    top: number;
    left: number;
    width: number;
    height: number;
    avoidRect?: {
        top: number;
        left: number;
        right: number;
        bottom: number;
    };
}

function getTargetBox(selector: string): TargetBox | null {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return null;

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const formPanel = element.closest<HTMLElement>('.rounded-lg.shadow-xl');
    const formRect = formPanel?.getBoundingClientRect();

    // Keep the tutorial panel outside the form when targeting form controls.
    return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        avoidRect: formRect ? {
            top: formRect.top,
            left: formRect.left,
            right: formRect.right,
            bottom: formRect.bottom,
        } : undefined,
    };
}

function getClampedTop(top: number, panelHeight: number) {
    return Math.min(
        window.innerHeight - panelHeight - 12,
        Math.max(12, top)
    );
}

function getPanelPosition(box: TargetBox | null, panelHeight: number) {
    const panelWidth = Math.min(320, window.innerWidth - 24);
    // Center panel beside target
    const measuredPanelHeight = panelHeight || 190;
    if (!box) {
        return {
            width: panelWidth,
            top: Math.max(16, window.innerHeight / 2 - measuredPanelHeight / 2),
            left: Math.max(12, window.innerWidth / 2 - panelWidth / 2),
        };
    }

    if (box.avoidRect) {
        // Prefer side placement around modal panels.
        const gap = 16;
        const fitsLeftOfPanel = box.avoidRect.left >= panelWidth + gap + 12;
        const fitsRightOfPanel = window.innerWidth - box.avoidRect.right >= panelWidth + gap + 12;
        const top = getClampedTop(
            box.top + box.height / 2 - measuredPanelHeight / 2,
            measuredPanelHeight
        );

        if (fitsLeftOfPanel) {
            return {
                width: panelWidth,
                top,
                left: box.avoidRect.left - panelWidth - gap,
            };
        }

        if (fitsRightOfPanel) {
            return {
                width: panelWidth,
                top,
                left: box.avoidRect.right + gap,
            };
        }
    }

    const fitsLeft = box.left >= panelWidth + 28;
    const fitsBelow = box.top + box.height + 16 + 190 < window.innerHeight;
    const fitsAbove = box.top >= 210;

    let top = box.top;
    let left = box.left - panelWidth - 18;

    if (!fitsLeft) {
        left = Math.min(window.innerWidth - panelWidth - 12, Math.max(12, box.left));
        if (fitsBelow) {
            top = box.top + box.height + 16;
        } else if (fitsAbove) {
            top = box.top - 196;
        } else {
            top = Math.min(window.innerHeight - 206, Math.max(12, box.top));
        }
    }

    return {
        width: panelWidth,
        top: getClampedTop(top, measuredPanelHeight),
        left: Math.min(window.innerWidth - panelWidth - 12, Math.max(12, left)),
    };
}

export function TutorialOverlay({ steps, stepIndex, onSkip, onNext }: TutorialOverlayProps) {
    const { t } = useTranslation();
    const step = steps[stepIndex];
    const panelRef = useRef<HTMLElement>(null);
    const [targetBox, setTargetBox] = useState<TargetBox | null>(null);
    const [panelHeight, setPanelHeight] = useState(0);
    const panelPosition = useMemo(() => getPanelPosition(targetBox, panelHeight), [panelHeight, targetBox]);
    const bodyParagraphs = useMemo(
        () => typeof step.body === 'string' ? step.body.split(/\n{2,}/) : null,
        [step.body]
    );

    const updateTargetBox = useCallback(() => {
        setTargetBox(getTargetBox(step.target));
    }, [step.target]);

    useLayoutEffect(() => {
        const frameId = window.requestAnimationFrame(updateTargetBox);
        return () => window.cancelAnimationFrame(frameId);
    }, [updateTargetBox]);

    useLayoutEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;

        // Update panel height after body renders
        const updatePanelHeight = () => setPanelHeight(panel.getBoundingClientRect().height);
        const frameId = window.requestAnimationFrame(updatePanelHeight);

        const resizeObserver = new ResizeObserver(updatePanelHeight);
        resizeObserver.observe(panel);
        return () => {
            window.cancelAnimationFrame(frameId);
            resizeObserver.disconnect();
        };
    }, [stepIndex, step.body, step.title]);

    useEffect(() => {
        const intervalId = window.setInterval(updateTargetBox, 150);
        window.addEventListener('resize', updateTargetBox);
        window.addEventListener('scroll', updateTargetBox, true);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('resize', updateTargetBox);
            window.removeEventListener('scroll', updateTargetBox, true);
        };
    }, [updateTargetBox]);

    useEffect(() => {
        if (step.hideIndicator) return;

        const element = document.querySelector<HTMLElement>(step.target);
        if (!element) return;

        element.classList.add('tutorial-indicator');
        return () => element.classList.remove('tutorial-indicator');
    }, [step.hideIndicator, step.target]);

    return createPortal(
        <div className="fixed inset-0 z-[1400] pointer-events-none">
            <section
                ref={panelRef}
                role="dialog"
                aria-modal="false"
                aria-labelledby="tutorial-title"
                className="absolute pointer-events-auto rounded-lg border border-border bg-surface p-4 shadow-xl"
                style={panelPosition}
                aria-live="polite"
            >
                <div className="mb-2 text-xs font-semibold uppercase text-text-muted">
                    {t('tutorial.progress', { current: stepIndex + 1, total: steps.length })}
                </div>
                <h2 id="tutorial-title" className="text-base font-semibold text-text">{step.title}</h2>
                {bodyParagraphs ? (
                    <div className="mt-2 space-y-1.5 text-sm leading-5 text-text-secondary [&_strong]:font-semibold [&_strong]:text-text">
                        {bodyParagraphs.map((paragraph, index) => (
                            <p key={index} className="whitespace-pre-line">
                                {paragraph}
                            </p>
                        ))}
                    </div>
                ) : (
                    <div className="mt-2 space-y-1.5 text-sm leading-5 text-text-secondary [&_p+_p]:mt-1.5 [&_strong]:font-semibold [&_strong]:text-text">
                        {step.body}
                    </div>
                )}
                <div className="mt-2 flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={onSkip}
                        className="rounded-md px-2 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-muted hover:text-text-secondary"
                    >
                        {t('tutorial.skip')}
                    </button>
                    {step.nextStepIndex !== undefined && onNext && (
                        <button
                            type="button"
                            onClick={() => onNext(step.nextStepIndex!)}
                            className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover"
                        >
                            {t('tutorial.next')}
                        </button>
                    )}
                </div>
            </section>
        </div>,
        document.body
    );
}
