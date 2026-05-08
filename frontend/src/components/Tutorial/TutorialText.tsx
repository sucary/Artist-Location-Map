import type { TutorialStep } from './TutorialOverlay';

export const TutorialText: TutorialStep[] = [
    {
        target: '[data-tutorial-target="add-artist-button"]',
        title: 'Add your first artist',
        body: 'Start by pressing this button.',
        actionLabel: 'Press the highlighted button',
    },
    {
        target: '[data-tutorial-target="artist-search"]',
        title: 'Search the artist',
        body: (
            <>
                <p>
                    Enter the artist name, then press Enter or the search button.
                </p>
                <p>
                    If the artist is not found, switch on <b>Deep search</b> and retry.
                </p>
            </>
        ),
        actionLabel: 'Select an artist result',
        waitForTarget: true,
    },
    {
        target: '[data-tutorial-target="origin-location-field"]',
        title: 'Set the origin',
        body: (
            <>
                <p>
                    Search the artist origin, usually a <strong>city</strong> or <strong>province</strong>.
                    You can also manually pick a location on the map.
                </p>
            </>
        ),
        actionLabel: 'Select an origin result',
        waitForTarget: true,
    },
    {
        target: '[data-tutorial-target="active-location-field"]',
        title: 'Set the active location',
        body: (
            <>
                <p>
                    Repeat the location search for where the artist is active now.
                </p>
                <p>If it is the same as the origin, you can copy it with the arrow button.</p>
            </>
        ),
        actionLabel: 'Select or copy active location',
        waitForTarget: true,
    },
    {
        target: '[data-tutorial-target="debut-year"]',
        title: 'Set career years',
        body: 'Select the debut year. As well as inactive year, if the artist is no longer active.',
        actionLabel: 'Set career years',
        waitForTarget: true,
        nextStepIndex: 5,
    },
    {
        target: '[data-tutorial-target="social-links"]',
        title: 'Add external links',
        body: 'External links such as social media and official page are optional.',
        actionLabel: 'Optional',
        waitForTarget: true,
        nextStepIndex: 6,
    },
    {
        target: '[data-tutorial-target="artist-image"]',
        title: 'Upload an artist image',
        body: 'Add an image for the artist. The image will be applied to both avatar and banner.',
        actionLabel: 'Upload and crop an image',
        waitForTarget: true,
        nextStepIndex: 7,
        hideIndicator: true,
    },
    {
        target: '[data-tutorial-target="save-artist"]',
        title: 'Save the artist',
        body: 'Once everything is set, save your artist to the map!',
        actionLabel: 'Press Save when ready',
        waitForTarget: true,
    },
];

export type TutorialAction =
    | 'artistSelected'
    | 'originalLocationSet'
    | 'activeLocationSet'
    | 'debutYearSet'
    | 'inactiveEnabled'
    | 'inactiveDisabled'
    | 'inactiveYearSet'
    | 'artistImageSet'
    | 'socialOpened';
