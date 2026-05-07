interface MapErrorOverlayProps {
    message: string;
}

export function MapErrorOverlay({ message }: MapErrorOverlayProps) {
    return (
        <div className="absolute inset-0 z-[900] flex items-center justify-center bg-surface-secondary px-4 text-center text-sm font-medium text-text-secondary">
            {message}
        </div>
    );
}
