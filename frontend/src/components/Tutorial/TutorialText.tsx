import type { TutorialStep } from './TutorialOverlay';
import { Trans, useTranslation } from 'react-i18next';

export function useTutorialText(): TutorialStep[] {
    const { t } = useTranslation();

    return [
        {
            target: '[data-tutorial-target="add-artist-button"]',
            title: t('tutorial.steps.addArtist.title'),
            body: t('tutorial.steps.addArtist.body'),
        },
        {
            target: '[data-tutorial-target="artist-search"]',
            title: t('tutorial.steps.searchArtist.title'),
            body: (
                <>
                    <p>{t('tutorial.steps.searchArtist.body.search')}</p>
                    <p>
                        <Trans
                            i18nKey="tutorial.steps.searchArtist.body.deepSearch"
                            components={{ strong: <strong /> }}
                        />
                    </p>
                </>
            ),
            waitForTarget: true,
        },
        {
            target: '[data-tutorial-target="origin-location-field"]',
            title: t('tutorial.steps.origin.title'),
            body: (
                <p>
                    <Trans
                        i18nKey="tutorial.steps.origin.body"
                        components={{ strong: <strong /> }}
                    />
                </p>
            ),
            waitForTarget: true,
        },
        {
            target: '[data-tutorial-target="active-location-field"]',
            title: t('tutorial.steps.activeLocation.title'),
            body: (
                <>
                    <p>{t('tutorial.steps.activeLocation.body.search')}</p>
                    <p>{t('tutorial.steps.activeLocation.body.copy')}</p>
                </>
            ),
            waitForTarget: true,
        },
        {
            target: '[data-tutorial-target="debut-year"]',
            title: t('tutorial.steps.careerYears.title'),
            body: t('tutorial.steps.careerYears.body'),
            waitForTarget: true,
            nextStepIndex: 5,
        },
        {
            target: '[data-tutorial-target="social-links"]',
            title: t('tutorial.steps.externalLinks.title'),
            body: t('tutorial.steps.externalLinks.body'),
            waitForTarget: true,
            nextStepIndex: 6,
        },
        {
            target: '[data-tutorial-target="artist-image"]',
            title: t('tutorial.steps.artistImage.title'),
            body: t('tutorial.steps.artistImage.body'),
            waitForTarget: true,
            nextStepIndex: 7,
            hideIndicator: true,
        },
        {
            target: '[data-tutorial-target="save-artist"]',
            title: t('tutorial.steps.saveArtist.title'),
            body: t('tutorial.steps.saveArtist.body'),
            waitForTarget: true,
        },
    ];
}

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
