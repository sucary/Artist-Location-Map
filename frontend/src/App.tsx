import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import './App.css';
import { copyArtistCollectionByUsername, createGig, deleteArtist, deleteGig, getArtistsByUsername, getFeaturedArtists, getGigs, updateArtist, updateGig, updateProfile } from './services/api';
import MapView from './components/Map/MapView';
import ArtistForm from './components/ArtistForm/ArtistForm';
import ArtistList from './components/ArtistList';
import AddArtistButton from './components/Map/buttons/AddArtistButton';
import AddGigButton from './components/Map/buttons/AddGigButton';
import ViewGigPanelButton from './components/Map/buttons/ViewGigPanelButton';
import ViewGigCalendarButton from './components/Map/buttons/ViewGigCalendarButton';
import ViewArtistListButton from './components/Map/buttons/ViewArtistListButton';
import TourModeButton from './components/Map/buttons/TourModeButton';
import { AccountButton } from './components/Auth/AccountButton';
import { NotificationButton } from './components/Notifications/NotificationButton';
import { AdminDashboard } from './components/Admin/AdminDashboard';
import { MainSearch } from './components/MainSearch';
import { useAuth } from './context/AuthContext';
import type { Artist, SelectionMode } from './types/artist';
import type { Gig, GigInput, TourModeState } from './types/gig';
import { UsernamePrompt } from './components/Auth/UsernamePrompt';
import { ResetPasswordModal } from './components/Auth/ResetPasswordModal';
import { ViewingUserBanner, AnonymousUserBanner, FeaturedArtistsBanner } from './components/Banner';
import { UserNotFound } from './components/UserNotFound';
import { supabase } from './lib/supabase';
import { TutorialOverlay } from './components/Tutorial/TutorialOverlay';
import { useTutorialText, type TutorialAction } from './components/Tutorial/TutorialText';
import { ConfirmDialog, type ConfirmDialogVariant } from './components/ui';
import { Trans, useTranslation } from 'react-i18next';
import { TransStrong } from './components/i18n/TransComponents';
import { GigForm } from './components/Tour/GigForm';
import { GigPanel } from './components/Tour/GigPanel';
import { GigCalendar } from './components/Tour/GigCalendar';
import { TourControls } from './components/Tour/TourControls';
import { TourBanner } from './components/Tour/TourBanner';
import { formatGigDateTimeValue } from './utils/dateFormatting';

interface AppDialogState {
    title: string;
    message: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: ConfirmDialogVariant;
    dimBackdrop?: boolean;
    onConfirm: () => void | Promise<void>;
}

const getIsMobileLayout = () => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
);

const formatDateInputValue = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
};

const getDefaultTourInterval = () => {
    const fromDate = new Date();
    const toDate = new Date(fromDate);
    toDate.setMonth(toDate.getMonth() + 12);

    // Tour Mode opens on the expected upcoming-gig window
    return {
        from: formatDateInputValue(fromDate),
        to: formatDateInputValue(toDate),
    };
};

type RememberedTourModeState = Pick<TourModeState, 'interval' | 'selectedDay'>;

const STARRED_GIGS_STORAGE_KEY = 'achizu.starredGigs';

const readStoredStarredGigs = () => {
    if (typeof window === 'undefined') return new Set<string>();

    try {
        const parsed = JSON.parse(window.localStorage.getItem(STARRED_GIGS_STORAGE_KEY) ?? '[]');
        if (!Array.isArray(parsed)) return new Set<string>();

        // Storage can contain stale or malformed values from older clients
        return new Set(parsed.filter((value): value is string => typeof value === 'string'));
    } catch {
        return new Set<string>();
    }
};

function App() {
    const { username } = useParams<{ username?: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const { user, profile } = useAuth();
    const { i18n, t } = useTranslation();

    const [showForm, setShowForm] = useState(false);
    const [showGigForm, setShowGigForm] = useState(false);
    const [showGigPanel, setShowGigPanel] = useState(false);
    const [showGigCalendar, setShowGigCalendar] = useState(false);
    const [showArtistList, setShowArtistList] = useState(false);
    const [showFeaturedList, setShowFeaturedList] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showAdminDashboard, setShowAdminDashboard] = useState(false);
    const [showResetPassword, setShowResetPassword] = useState(() => {
        const hash = window.location.hash;
        if (hash.includes('type=recovery')) {
            window.history.replaceState(null, '', window.location.pathname);
            return true;
        }
        return false;
    });
    const [editingArtist, setEditingArtist] = useState<Artist | null>(null);
    const [editingGig, setEditingGig] = useState<Gig | null>(null);
    const [gigFormArtist, setGigFormArtist] = useState<Artist | null>(null);
    const [selectionMode, setSelectionMode] = useState<SelectionMode | null>(null);
    const [pendingCoordinates, setPendingCoordinates] = useState<{ lat: number; lng: number } | null>(null);
    const [focusedArtist, setFocusedArtist] = useState<Artist | null>(null);
    const [focusedGigId, setFocusedGigId] = useState<string | null>(null);
    const [isCopyingCollection, setIsCopyingCollection] = useState(false);
    const [isMobileLayout, setIsMobileLayout] = useState(getIsMobileLayout);
    const [artistPopupOpen, setArtistPopupOpen] = useState(false);
    const [artistListCardOpen, setArtistListCardOpen] = useState(false);
    const [artistListCloseCardSignal, setArtistListCloseCardSignal] = useState(0);
    const [mainSearchResultsOpen, setMainSearchResultsOpen] = useState(false);
    const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);
    const [mainSearchCloseSignal, setMainSearchCloseSignal] = useState(0);
    const [tutorialStepIndex, setTutorialStepIndex] = useState<number | null>(null);
    const [isTutorialDismissed, setIsTutorialDismissed] = useState(false);
    const [tutorialArtistHasImage, setTutorialArtistHasImage] = useState(false);
    const [appDialog, setAppDialog] = useState<AppDialogState | null>(null);
    const [appDialogLoading, setAppDialogLoading] = useState(false);
    const [rememberedTourMode, setRememberedTourMode] = useState<RememberedTourModeState>(() => ({
        interval: getDefaultTourInterval(),
        selectedDay: null,
    }));
    const [starredGigIds, setStarredGigIds] = useState<Set<string>>(readStoredStarredGigs);
    const tutorialSteps = useTutorialText();

    // Featured mode from URL param
    const viewingFeatured = searchParams.get('view') === 'featured';
    const viewingTour = searchParams.get('view') === 'tour' && !username;
    const tourFrom = searchParams.get('from');
    const tourTo = searchParams.get('to');
    const tourDay = searchParams.get('day');
    const urlTourInterval = tourFrom && tourTo ? { from: tourFrom, to: tourTo } : null;
    const activeTourInterval = urlTourInterval ?? rememberedTourMode.interval;
    const tourMode: TourModeState = {
        active: viewingTour,
        interval: viewingTour ? activeTourInterval : null,
        selectedDay: viewingTour && activeTourInterval
            ? urlTourInterval ? tourDay : rememberedTourMode.selectedDay
            : null,
    };
    const setViewingFeatured = useCallback((featured: boolean) => {
        if (featured) {
            setSearchParams({ view: 'featured' });
            setShowFeaturedList(false);
            setShowGigForm(false);
            setShowGigPanel(false);
            setShowGigCalendar(false);
        } else {
            setSearchParams({});
        }
    }, [setSearchParams]);

    const updateTourParams = useCallback((updates: { active?: boolean; from?: string | null; to?: string | null; day?: string | null }) => {
        const nextParams = new URLSearchParams(searchParams);

        if (updates.active === false) {
            nextParams.delete('view');
            nextParams.delete('from');
            nextParams.delete('to');
            nextParams.delete('day');
            setSearchParams(nextParams);
            return;
        }

        if (updates.active) {
            nextParams.set('view', 'tour');
        }

        if (updates.from !== undefined) {
            updates.from ? nextParams.set('from', updates.from) : nextParams.delete('from');
        }
        if (updates.to !== undefined) {
            updates.to ? nextParams.set('to', updates.to) : nextParams.delete('to');
        }
        if (updates.day !== undefined) {
            updates.day ? nextParams.set('day', updates.day) : nextParams.delete('day');
        }

        setSearchParams(nextParams);
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        if (!viewingTour || !tourFrom || !tourTo) return;

        // URL-loaded Tour Mode becomes the session restore point
        setRememberedTourMode({
            interval: { from: tourFrom, to: tourTo },
            selectedDay: tourDay,
        });
    }, [tourDay, tourFrom, tourTo, viewingTour]);

    // Viewing another user's map
    const isViewingOther = !!username;

    useEffect(() => {
        const mediaQuery = window.matchMedia('(max-width: 640px)');
        const syncMobileLayout = () => setIsMobileLayout(mediaQuery.matches);

        syncMobileLayout();
        mediaQuery.addEventListener('change', syncMobileLayout);
        return () => mediaQuery.removeEventListener('change', syncMobileLayout);
    }, []);

    // Fetch featured artists when viewing featured mode
    const { data: featuredArtists } = useQuery({
        queryKey: ['featuredArtists'],
        queryFn: getFeaturedArtists,
        enabled: viewingFeatured,
    });

    const gigQueryParams = tourMode.interval
        ? { from: tourMode.interval.from, to: tourMode.interval.to }
        : undefined;
    const { data: tourGigs = [] } = useQuery({
        queryKey: ['gigs', gigQueryParams],
        queryFn: () => getGigs(gigQueryParams),
        enabled: tourMode.active,
    });
    const highlightedGigCount = tourMode.selectedDay
        ? tourGigs.filter((gig) => gig.date === tourMode.selectedDay).length
        : 0;

    // Check if the user we're trying to view exists and is accessible
    const { error: userAccessError, isLoading: isCheckingUser } = useQuery({
        queryKey: ['userAccess', username],
        queryFn: () => getArtistsByUsername(username!),
        enabled: !!username,
        retry: false,
    });

    // Listen for password recovery event from auth state changes
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                setShowResetPassword(true);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        // Header notification opens App-owned dashboard modal.
        const handleOpenAdminDashboard = () => setShowAdminDashboard(true);
        window.addEventListener('open-admin-dashboard', handleOpenAdminDashboard);
        return () => window.removeEventListener('open-admin-dashboard', handleOpenAdminDashboard);
    }, []);

    useEffect(() => {
        // Open tutorial on user's own map
        if (
            user
            && profile?.isApproved
            && profile.tutorialCompleted === false
            && !isTutorialDismissed
            && tutorialStepIndex === null
            && !isViewingOther
            && !viewingFeatured
            && !showForm
        ) {
            setTutorialStepIndex(0);
        }
    }, [isTutorialDismissed, isViewingOther, profile, showForm, tutorialStepIndex, user, viewingFeatured]);

    const completeTutorial = useCallback(async () => {
        setTutorialStepIndex(null);
        setIsTutorialDismissed(true);

        if (!user || profile?.tutorialCompleted) return;

        try {
            await updateProfile({ tutorialCompleted: true });
            await queryClient.invalidateQueries({ queryKey: ['profile'] });
        } catch (error) {
            console.error('Failed to update tutorial state:', error);
        }
    }, [profile?.tutorialCompleted, queryClient, user]);

    const handleArtistFormSubmit = useCallback(() => {
        // Complete tutorial after saving artist
        if (tutorialStepIndex !== null) {
            void completeTutorial();
        }
    }, [completeTutorial, tutorialStepIndex]);

    const handleTutorialAction = useCallback((action: TutorialAction) => {
        // Move tutorial after required form actions
        setTutorialStepIndex((currentStep) => {
            if (currentStep === 1 && action === 'artistSelected') return 2;
            if (currentStep === 2 && action === 'originalLocationSet') return 3;
            if (currentStep === 3 && action === 'activeLocationSet') return 4;
            if (currentStep === 6 && action === 'artistImageSet') return 7;
            return currentStep;
        });
    }, []);

    const handleTutorialNext = useCallback((nextStepIndex: number) => {
        setTutorialStepIndex(nextStepIndex === 6 && tutorialArtistHasImage ? 7 : nextStepIndex);
    }, [tutorialArtistHasImage]);

    const handleStartSelection = (targetField: SelectionMode['targetField']) => {
        setSelectionMode({ active: true, targetField });
    };

    const handleLocationPick = (coordinates: { lat: number; lng: number } | null) => {
        setPendingCoordinates(coordinates);
        setSelectionMode(null);
    };

    const handleConsumeCoordinates = () => {
        setPendingCoordinates(null);
    };

    const handleDisplayCoordinateChange = useCallback(async (
        artist: Artist,
        view: 'original' | 'active',
        coordinates: { lat: number; lng: number }
    ) => {
        const payload = view === 'original'
            ? { originalLocationDisplayCoordinates: coordinates }
            : { activeLocationDisplayCoordinates: coordinates };
        await updateArtist(artist.id, payload);
        await queryClient.invalidateQueries({ queryKey: ['artists'] });
    }, [queryClient]);

    const handleEditArtist = (artist: Artist) => {
        if (!user) {
            setShowAuthModal(true);
            return;
        }
        setEditingArtist(artist);
        setShowGigForm(false);
        if (isMobileLayout) {
            setShowArtistList(false);
            setShowFeaturedList(false);
            setMainSearchCloseSignal((signal) => signal + 1);
        }
        setShowForm(true);
    };

    const handleCloseForm = () => {
        setShowForm(false);
        setEditingArtist(null);
        setSelectionMode(null);
        setTutorialArtistHasImage(false);
        if (tutorialStepIndex !== null && tutorialStepIndex > 0) {
            setTutorialStepIndex(0);
        }
    };

    const handleCloseGigForm = () => {
        setShowGigForm(false);
        setEditingGig(null);
        setGigFormArtist(null);
        setSelectionMode(null);
        setPendingCoordinates(null);
    };

    const handleCloseGigPanel = () => {
        setShowGigPanel(false);
    };

    const handleCloseGigCalendar = () => {
        setShowGigCalendar(false);
    };

    const showAppMessage = useCallback((
        title: string,
        message: ReactNode,
        variant: ConfirmDialogVariant = 'default'
    ) => {
        setAppDialog({
            title,
            message,
            variant,
            confirmLabel: t('common.ok'),
            onConfirm: () => setAppDialog(null),
        });
    }, [t]);

    const handleDeleteArtist = async (artist: Artist) => {
        if (!user) {
            setShowAuthModal(true);
            return;
        }

        setAppDialog({
            title: t('app.dialogs.deleteArtist.title'),
            message: (
                <Trans
                    i18nKey="app.dialogs.deleteArtist.message"
                    values={{ name: artist.name }}
                    components={{ strong: <TransStrong className="font-semibold text-[rgb(220,38,38)] app-dark:text-primary app-dark:font-bold" /> }}
                />
            ),
            variant: 'danger',
            confirmLabel: t('common.delete'),
            cancelLabel: t('common.cancel'),
            onConfirm: async () => {
                setAppDialogLoading(true);
                try {
                    await deleteArtist(artist.id);
                    await queryClient.invalidateQueries({ queryKey: ['artists'] });
                    setAppDialog(null);
                } catch (error) {
                    console.error('Failed to delete artist:', error);
                    showAppMessage(
                        t('app.dialogs.deleteArtist.errorTitle'),
                        t('app.dialogs.deleteArtist.errorMessage'),
                        'error'
                    );
                } finally {
                    setAppDialogLoading(false);
                }
            },
        });
    };

    const handleAddArtistClick = () => {
        if (!user) {
            setShowAuthModal(true);
        } else {
            setShowArtistList(false);
            setShowFeaturedList(false);
            setShowGigForm(false);
            setShowGigPanel(false);
            setShowGigCalendar(false);
            setMainSearchCloseSignal((signal) => signal + 1);
            setShowForm(true);
            setTutorialArtistHasImage(false);
            if (tutorialStepIndex === 0) {
                setTutorialStepIndex(1);
            }
        }
    };

    const handleEnterTourMode = () => {
        if (!user) {
            setShowAuthModal(true);
            return;
        }

        setShowForm(false);
        setShowArtistList(false);
        setShowFeaturedList(false);
        setShowGigPanel(false);
        setShowGigCalendar(false);
        setMainSearchCloseSignal((signal) => signal + 1);
        updateTourParams({
            active: true,
            from: rememberedTourMode.interval?.from ?? null,
            to: rememberedTourMode.interval?.to ?? null,
            day: rememberedTourMode.selectedDay,
        });
    };

    const handleExitTourMode = () => {
        handleCloseGigForm();
        handleCloseGigPanel();
        handleCloseGigCalendar();
        updateTourParams({ active: false });
    };

    const handleTourIntervalChange = (from: string, to: string) => {
        setRememberedTourMode({ interval: { from, to }, selectedDay: null });
        updateTourParams({ active: true, from, to, day: null });
    };

    const handleTourDateReset = () => {
        setRememberedTourMode({ interval: null, selectedDay: null });
        updateTourParams({ active: true, from: null, to: null, day: null });
    };

    const handleAddGigClick = () => {
        if (!user) {
            setShowAuthModal(true);
            return;
        }

        setShowForm(false);
        setShowArtistList(false);
        setShowFeaturedList(false);
        setShowGigPanel(false);
        setShowGigCalendar(false);
        setMainSearchCloseSignal((signal) => signal + 1);
        setEditingGig(null);
        setGigFormArtist(null);
        setShowGigForm(true);
        updateTourParams({ active: true });
    };

    const handleAddGigForArtist = (artist: Artist) => {
        if (!user) {
            setShowAuthModal(true);
            return;
        }

        setShowArtistList(false);
        setShowGigPanel(false);
        setShowGigCalendar(false);
        setEditingGig(null);
        setGigFormArtist(artist);
        setShowGigForm(true);
        updateTourParams({ active: true });
    };

    const handleEditGig = (gig: Gig) => {
        setShowForm(false);
        setShowGigPanel(false);
        setShowGigCalendar(false);
        setEditingGig(gig);
        setGigFormArtist(null);
        setShowGigForm(true);
    };

    const handleGigFormSubmit = async (input: GigInput, id?: string) => {
        if (id) {
            await updateGig(id, input);
        } else {
            await createGig(input);
        }
        await queryClient.invalidateQueries({ queryKey: ['gigs'] });
        await queryClient.invalidateQueries({ queryKey: ['tours'] });
        handleCloseGigForm();
    };

    const handleOpenGigPanel = () => {
        setShowForm(false);
        setShowGigForm(false);
        setShowArtistList(false);
        setShowFeaturedList(false);
        setShowGigCalendar(false);
        setMainSearchCloseSignal((signal) => signal + 1);
        setShowGigPanel(true);
    };

    const handleOpenGigCalendar = () => {
        setShowForm(false);
        setShowGigForm(false);
        setShowArtistList(false);
        setShowFeaturedList(false);
        setShowGigPanel(false);
        setMainSearchCloseSignal((signal) => signal + 1);
        setShowGigCalendar(true);
    };

    const handleSelectCalendarDay = (day: string | null) => {
        // Calendar day selection reuses Tour Mode map highlighting
        setRememberedTourMode((currentMode) => ({
            ...currentMode,
            selectedDay: day,
        }));
        updateTourParams({ active: true, day });
    };

    const handleToggleGigStar = useCallback((gig: Gig) => {
        setStarredGigIds((currentIds) => {
            const nextIds = new Set(currentIds);
            if (nextIds.has(gig.id)) {
                nextIds.delete(gig.id);
            } else {
                nextIds.add(gig.id);
            }

            try {
                window.localStorage.setItem(STARRED_GIGS_STORAGE_KEY, JSON.stringify([...nextIds]));
            } catch {
                // Local storage failures should not block visual starring
            }

            return nextIds;
        });
    }, []);

    const handleDeleteGig = (gig: Gig) => {
        setAppDialog({
            title: t('tour.dialogs.deleteGig.title'),
            message: t('tour.dialogs.deleteGig.message', { artist: gig.artist.name, date: formatGigDateTimeValue(gig.date, gig.time, i18n.resolvedLanguage || i18n.language || undefined) }),
            variant: 'danger',
            confirmLabel: t('common.delete'),
            cancelLabel: t('common.cancel'),
            onConfirm: async () => {
                setAppDialogLoading(true);
                try {
                    await deleteGig(gig.id);
                    await queryClient.invalidateQueries({ queryKey: ['gigs'] });
                    setAppDialog(null);
                } catch (error) {
                    console.error('Failed to delete gig:', error);
                    showAppMessage(t('tour.errors.deleteFailedTitle'), t('tour.errors.deleteFailedMessage'), 'error');
                } finally {
                    setAppDialogLoading(false);
                }
            },
        });
    };

    const handleViewArtistListClick = () => {
        setShowForm(false);
        setMainSearchCloseSignal((signal) => signal + 1);
        setArtistListCardOpen(false);
        setShowGigPanel(false);
        setShowGigCalendar(false);
        setShowArtistList(true);
    };

    const handleEditFromList = (artist: Artist) => {
        setShowArtistList(false);
        handleEditArtist(artist);
    };

    const handleNavigateToArtist = (artist: Artist) => {
        setShowArtistList(false);
        setShowFeaturedList(false);
        setArtistListCardOpen(false);
        setFocusedArtist(artist);
    };

    const handleCloseArtistList = useCallback(() => {
        setArtistListCardOpen(false);
        setShowArtistList(false);
    }, []);

    const handleCloseFeaturedList = useCallback(() => {
        setArtistListCardOpen(false);
        setShowFeaturedList(false);
    }, []);

    const handleArtistListEmptyMapClick = useCallback(() => {
        if (artistListCardOpen) {
            setArtistListCloseCardSignal((signal) => signal + 1);
            return;
        }

        if (showArtistList) {
            handleCloseArtistList();
            return;
        }

        if (showFeaturedList) {
            handleCloseFeaturedList();
        }
    }, [artistListCardOpen, handleCloseArtistList, handleCloseFeaturedList, showArtistList, showFeaturedList]);

    const handleArtistPopupOpenChange = useCallback((open: boolean) => {
        setArtistPopupOpen(open);

        if (!open || !isMobileLayout) return;
        // Mobile keeps one foreground surface open at a time.
        setShowForm(false);
        setShowGigForm(false);
        setShowGigPanel(false);
        setShowGigCalendar(false);
        setShowArtistList(false);
        setShowFeaturedList(false);
        setMainSearchCloseSignal((signal) => signal + 1);
    }, [isMobileLayout]);

    const handleMainSearchResultsOpenChange = useCallback((open: boolean) => {
        setMainSearchResultsOpen(open);

        if (!open || !isMobileLayout) return;
        // Main search owns the mobile foreground while results are visible.
        setShowForm(false);
        setShowGigForm(false);
        setShowGigPanel(false);
        setShowGigCalendar(false);
        setShowArtistList(false);
        setShowFeaturedList(false);
    }, [isMobileLayout]);

    // Lock map gestures under modal-like mobile panels and open menus.
    const mapInteractionsDisabled = (isMobileLayout && showArtistList)
        || (isMobileLayout && showFeaturedList)
        || (isMobileLayout && showGigForm)
        || (isMobileLayout && showGigPanel)
        || (isMobileLayout && showGigCalendar)
        || mainSearchResultsOpen
        || notificationMenuOpen
        || accountMenuOpen;

    const handleCopyArtistCollection = async (artistCount: number) => {
        if (!username || !user || !profile?.isApproved || isCopyingCollection) {
            return;
        }

        setAppDialog({
            title: t('app.dialogs.copyCollection.title'),
            message: (
                <>
                    <p>
                        <Trans
                            i18nKey="app.dialogs.copyCollection.message"
                            values={{ count: artistCount, username }}
                            components={{
                                count: <TransStrong className="font-semibold text-primary-contrast app-dark:text-primary-text-dark" />,
                                username: <TransStrong className="font-semibold text-primary-contrast app-dark:text-primary-text-dark" />,
                            }}
                        />
                    </p>
                    <p className="mt-1">{t('app.dialogs.copyCollection.skipExisting')}</p>
                </>
            ),
            variant: 'default',
            confirmLabel: t('common.copy'),
            cancelLabel: t('common.cancel'),
            onConfirm: async () => {
                setAppDialogLoading(true);
                setIsCopyingCollection(true);
                try {
                    const result = await copyArtistCollectionByUsername(username);
                    await queryClient.invalidateQueries({ queryKey: ['artists'] });
                    showAppMessage(
                        t('app.dialogs.copyCollection.successTitle'),
                        t('app.dialogs.copyCollection.successMessage', { count: result.copied, copied: result.copied, skipped: result.skipped }),
                        'success'
                    );
                } catch (error) {
                    console.error('Failed to copy artist collection:', error);
                    showAppMessage(
                        t('app.dialogs.copyCollection.errorTitle'),
                        t('app.dialogs.copyCollection.errorMessage'),
                        'error'
                    );
                } finally {
                    setIsCopyingCollection(false);
                    setAppDialogLoading(false);
                }
            },
        });
    };

    // Show loading state while checking user access
    if (isViewingOther && isCheckingUser) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-surface-secondary">
                <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    // Show error page if user not found or inaccessible
    if (isViewingOther && userAccessError && username) {
        return <UserNotFound username={username} />;
    }

    return (
        <main className="h-screen w-screen flex flex-col bg-background text-text">
            {/* Top controls */}
            <div className="absolute top-2 inset-x-2 z-[1100] flex items-start gap-2 pointer-events-none">
                <div className="flex min-w-0 flex-1 items-center gap-2 pointer-events-auto">
                    {user && (
                        <>
                            <div className="min-w-0 flex-1 sm:flex-none">
                                <MainSearch
                                    mapUsername={username}
                                    onSelectArtist={handleNavigateToArtist}
                                    closeSignal={mainSearchCloseSignal}
                                    onResultsOpenChange={handleMainSearchResultsOpenChange}
                                />
                            </div>
                            {viewingFeatured ? (
                                <button
                                    aria-label={t('banner.backToMyMap')}
                                    onClick={() => setViewingFeatured(false)}
                                    className="h-12 w-12 shrink-0 flex items-center justify-center bg-surface border border-border rounded-md shadow-md text-text hover:bg-primary hover:text-white hover:border-primary active:bg-primary active:text-white active:border-primary transition-colors focus:outline-none"
                                    title={t('banner.backToMyMap')}
                                >
                                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                        <polyline points="9 22 9 12 15 12 15 22" />
                                    </svg>
                                </button>
                            ) : (
                                <button
                                    aria-label={t('banner.viewCommunityArtists')}
                                    onClick={() => setViewingFeatured(true)}
                                    className="h-12 w-12 shrink-0 flex items-center justify-center bg-surface border border-border rounded-md shadow-md text-text hover:bg-primary hover:text-white hover:border-primary active:bg-primary active:text-white active:border-primary transition-colors focus:outline-none"
                                    title={t('banner.viewCommunityArtists')}
                                >
                                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polygon points="7.5,1.5 9,6 13.5,7.5 9,9 7.5,13.5 6,9 1.5,7.5 6,6" />
                                        <polygon points="18.5,6.5 19.5,9.5 22.5,10.5 19.5,11.5 18.5,14.5 17.5,11.5 14.5,10.5 17.5,9.5" />
                                        <polygon points="11.5,15.5 12.2,18 14.5,19 12.2,20 11.5,22.5 10.8,20 8.5,19 10.8,18" />
                                    </svg>
                                </button>
                            )}
                            {!isViewingOther && profile?.isApproved && (
                                <TourModeButton
                                    active={tourMode.active}
                                    onClick={tourMode.active ? handleExitTourMode : handleEnterTourMode}
                                />
                            )}
                        </>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-2 pointer-events-auto">
                    <div className="z-[1250]">
                        {user && <NotificationButton onOpenChange={setNotificationMenuOpen} />}
                    </div>
                    <div className="z-[1100]">
                        <AccountButton
                            showAuthModal={showAuthModal}
                            onOpenAuthModal={() => setShowAuthModal(true)}
                            onCloseAuthModal={() => setShowAuthModal(false)}
                            onOpenAdminDashboard={() => setShowAdminDashboard(true)}
                            onMenuOpenChange={setAccountMenuOpen}
                        />
                    </div>
                </div>
            </div>

            {/* Bottom center: Viewing banner, Featured banner, or Anonymous banner */}
            {isViewingOther && username ? (
                <div className="absolute top-16 inset-x-2 z-[1100] flex justify-center sm:inset-x-auto sm:top-auto sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2">
                    <ViewingUserBanner username={username} />
                </div>
            ) : tourMode.active && user ? (
                <div className="absolute top-16 inset-x-2 z-[1100] flex justify-center sm:inset-x-auto sm:top-auto sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2">
                    <TourBanner
                        tourMode={tourMode}
                        gigCount={tourGigs.length}
                        highlightedCount={highlightedGigCount}
                        onExit={handleExitTourMode}
                    />
                </div>
            ) : viewingFeatured && user ? (
                <div className="absolute top-16 inset-x-2 z-[1100] flex justify-center sm:inset-x-auto sm:top-auto sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2">
                    <FeaturedArtistsBanner
                        artistCount={featuredArtists?.length || 0}
                        onHomeClick={() => setViewingFeatured(false)}
                    />
                </div>
            ) : !user && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1100]">
                    <AnonymousUserBanner onSignInClick={() => setShowAuthModal(true)} />
                </div>
            )}

            {/* Show username prompt for OAuth users without username */}
            {user && profile && !profile.username && (
                <UsernamePrompt onComplete={() => {
                    queryClient.invalidateQueries({ queryKey: ['profile'] });
                }} />
            )}

            {!showForm && !showGigForm && !showGigPanel && !showGigCalendar && (!isMobileLayout || !showArtistList) && !(isMobileLayout && artistPopupOpen) && user && profile?.isApproved && !isViewingOther && !viewingFeatured && !tourMode.active && (
                <AddArtistButton onClick={handleAddArtistClick} />
            )}
            {!showForm && !showGigForm && !showGigPanel && !showGigCalendar && (!isMobileLayout || !showArtistList) && !(isMobileLayout && artistPopupOpen) && user && profile?.isApproved && !isViewingOther && tourMode.active && (
                <AddGigButton onClick={handleAddGigClick} />
            )}
            {tourMode.active && !showForm && !showGigForm && !showGigPanel && !showGigCalendar && (!isMobileLayout || !showArtistList) && !(isMobileLayout && artistPopupOpen) && user && profile?.isApproved && !isViewingOther && !viewingFeatured && (
                <ViewGigPanelButton onClick={handleOpenGigPanel} />
            )}
            {tourMode.active && !showForm && !showGigForm && !showGigPanel && !showGigCalendar && (!isMobileLayout || !showArtistList) && !(isMobileLayout && artistPopupOpen) && user && profile?.isApproved && !isViewingOther && !viewingFeatured && (
                <ViewGigCalendarButton onClick={handleOpenGigCalendar} />
            )}
            {!tourMode.active && (!isMobileLayout || !showArtistList) && !showGigPanel && !showGigCalendar && !(isMobileLayout && artistPopupOpen) && user && (!viewingFeatured || !showFeaturedList || !isMobileLayout) && (
                <ViewArtistListButton onClick={() => {
                    if (viewingFeatured) {
                        setShowForm(false);
                        setMainSearchCloseSignal((signal) => signal + 1);
                        setShowFeaturedList(true);
                    } else {
                        handleViewArtistListClick();
                    }
                }} />
            )}
            {showForm && (
                <div className={selectionMode?.active ? 'hidden sm:block' : undefined}>
                    <ArtistForm
                        key={editingArtist?.id ?? 'new'}
                        initialData={editingArtist ?? undefined}
                        onSubmit={handleArtistFormSubmit}
                        onCancel={handleCloseForm}
                        onRequestSelection={handleStartSelection}
                        pendingCoordinates={pendingCoordinates}
                        onConsumePendingCoordinates={handleConsumeCoordinates}
                        onTutorialAction={handleTutorialAction}
                        onTutorialImageStateChange={setTutorialArtistHasImage}
                        onTutorialComplete={() => {
                            if (tutorialStepIndex !== null) {
                                void completeTutorial();
                            }
                        }}
                    />
                </div>
            )}
            {showGigForm && (
                <div className={selectionMode?.active ? 'hidden sm:block' : undefined}>
                    <GigForm
                        initialGig={editingGig}
                        initialArtist={gigFormArtist}
                        onSubmit={handleGigFormSubmit}
                        onCancel={handleCloseGigForm}
                        onRequestSelection={handleStartSelection}
                        pendingCoordinates={pendingCoordinates}
                        onConsumePendingCoordinates={handleConsumeCoordinates}
                    />
                </div>
            )}
            {showGigPanel && (
                <GigPanel
                    gigs={tourGigs}
                    onClose={handleCloseGigPanel}
                    onEditGig={handleEditGig}
                    onDeleteGig={handleDeleteGig}
                    onLocateGig={(gig) => setFocusedGigId(gig.id)}
                    starredGigIds={starredGigIds}
                    onToggleGigStar={handleToggleGigStar}
                />
            )}
            {showGigCalendar && (
                <GigCalendar
                    gigs={tourGigs}
                    selectedDay={tourMode.selectedDay}
                    onSelectDay={handleSelectCalendarDay}
                    onClose={handleCloseGigCalendar}
                    starredGigIds={starredGigIds}
                    onToggleGigStar={handleToggleGigStar}
                />
            )}
            {(showArtistList || (viewingFeatured && showFeaturedList)) && (
                <ArtistList
                    username={username}
                    viewingFeatured={viewingFeatured}
                    onClose={viewingFeatured ? handleCloseFeaturedList : handleCloseArtistList}
                    closeSelectedSignal={artistListCloseCardSignal}
                    onSelectedArtistChange={setArtistListCardOpen}
                    onNavigateToArtist={handleNavigateToArtist}
                    onEditArtist={isViewingOther || viewingFeatured ? undefined : handleEditFromList}
                    onDeleteArtist={isViewingOther || viewingFeatured ? undefined : handleDeleteArtist}
                    onAddGig={tourMode.active && !isViewingOther && !viewingFeatured ? handleAddGigForArtist : undefined}
                    onCopyCollection={isViewingOther && !viewingFeatured && user && profile?.isApproved ? handleCopyArtistCollection : undefined}
                    isCopyingCollection={isCopyingCollection}
                />
            )}
            {showAdminDashboard && (
                <AdminDashboard onClose={() => setShowAdminDashboard(false)} />
            )}
            {showResetPassword && (
                <ResetPasswordModal onClose={() => setShowResetPassword(false)} />
            )}
            {tutorialStepIndex !== null && (
                <TutorialOverlay
                    steps={tutorialSteps}
                    stepIndex={tutorialStepIndex}
                    onNext={handleTutorialNext}
                    onSkip={completeTutorial}
                />
            )}
            {appDialog && (
                <ConfirmDialog
                    open
                    title={appDialog.title}
                    variant={appDialog.variant}
                    confirmLabel={appDialog.confirmLabel}
                    cancelLabel={appDialog.cancelLabel}
                    isLoading={appDialogLoading}
                    dimBackdrop={appDialog.dimBackdrop}
                    onCancel={() => setAppDialog(null)}
                    onConfirm={() => { void appDialog.onConfirm(); }}
                >
                    {appDialog.message}
                </ConfirmDialog>
            )}
            <MapView
                username={username}
                viewingFeatured={viewingFeatured}
                tourMode={tourMode}
                selectionMode={selectionMode}
                onLocationPick={handleLocationPick}
                onEditArtist={isViewingOther || viewingFeatured || !user ? undefined : handleEditArtist}
                onDeleteArtist={isViewingOther || viewingFeatured || !user ? undefined : handleDeleteArtist}
                onEditGig={tourMode.active ? handleEditGig : undefined}
                onDeleteGig={tourMode.active ? handleDeleteGig : undefined}
                starredGigIds={starredGigIds}
                onToggleGigStar={handleToggleGigStar}
                onEmptyClick={showGigCalendar ? handleCloseGigCalendar : showGigPanel ? handleCloseGigPanel : showGigForm ? handleCloseGigForm : showForm ? handleCloseForm : (showArtistList || showFeaturedList) ? handleArtistListEmptyMapClick : undefined}
                focusedArtist={focusedArtist}
                onFocusedArtistHandled={() => setFocusedArtist(null)}
                focusedGigId={focusedGigId}
                onFocusedGigHandled={() => setFocusedGigId(null)}
                isAuthenticated={!!user}
                suppressArtistPopup={isMobileLayout && (showForm || showGigForm || showGigPanel || showGigCalendar || showArtistList || showFeaturedList || mainSearchResultsOpen)}
                onArtistPopupOpenChange={handleArtistPopupOpenChange}
                interactionsDisabled={mapInteractionsDisabled}
                canAdjustDisplayCoordinates={!isViewingOther && !viewingFeatured && !tourMode.active && !!user}
                onDisplayCoordinateChange={handleDisplayCoordinateChange}
                tourControlSlot={tourMode.active && !showGigForm && !showGigPanel && !showGigCalendar ? (
                    <TourControls
                        tourMode={tourMode}
                        onIntervalChange={handleTourIntervalChange}
                        onReset={handleTourDateReset}
                    />
                ) : undefined}
            />
        </main>
    );
};

export default App;
