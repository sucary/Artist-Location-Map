import { PageLayout, PageSection } from './ui';

export function AboutPage() {
    const credits = [
        {
            name: 'OpenStreetMap',
            description: 'Map data and geocoding services via Nominatim and Overpass API.',
            url: 'https://www.openstreetmap.org/',
            license: 'ODbL',
        },
        {
            name: 'MapLibre GL JS',
            description: 'Interactive vector map rendering.',
            url: 'https://maplibre.org/',
            license: 'BSD-3-Clause',
        },
        {
            name: 'CARTO',
            description: 'Base map styles and tiles.',
            url: 'https://carto.com/',
            license: null,
        },
    ];

    return (
        <PageLayout title="About">
            {/* Project */}
            <PageSection>
                <h2 className="text-lg text-text mb-2">Achizu</h2>
                <p className="text-sm text-text-secondary mb-3">
                    An open-source project for mapping your favorite artists around the world.
                </p>
                <a
                    href="https://github.com/sucary/achizu"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary-hover"
                >
                    <svg aria-hidden="true" className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                    </svg>
                    View on GitHub
                </a>
            </PageSection>

            {/* APIs & Libraries */}
            <PageSection title="APIs & Libraries">
                <div className="space-y-4">
                    {credits.map((credit) => (
                        <div key={credit.name}>
                            <div className="flex items-center gap-2">
                                <a
                                    href={credit.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-medium text-primary hover:text-primary-hover"
                                >
                                    {credit.name}
                                </a>
                                {credit.license && (
                                    <span className="text-xs text-text-muted bg-surface-secondary px-1.5 py-0.5 rounded">
                                        {credit.license}
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-text-secondary mt-0.5">
                                {credit.description}
                            </p>
                        </div>
                    ))}
                </div>
            </PageSection>

            {/* Attribution Notice */}
            <PageSection title="Attribution">
                <p className="text-sm text-text-secondary">
                    Map data &copy; OpenStreetMap contributors. This project uses data from OpenStreetMap,
                    which is made available under the Open Database License (ODbL).
                </p>
            </PageSection>
        </PageLayout>
    );
}
