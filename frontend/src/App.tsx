import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import './App.css';
import { copyArtistCollectionByUsername, deleteArtist, getArtistsByUsername, getFeaturedArtists, updateProfile } from './services/api';
import MapView from './components/Map/MapView';
import ArtistForm from './components/ArtistForm/ArtistForm';
import ArtistList from './components/ArtistList';
import AddArtistButton from './components/Map/buttons/AddArtistButton';
import ViewArtistListButton from './components/Map/buttons/ViewArtistListButton';
import { AccountButton } from './components/Auth/AccountButton';
import { NotificationButton } from './components/Notifications/NotificationButton';
import { AdminDashboard } from './components/Admin/AdminDashboard';
import { MainSearch } from './components/MainSearch';
import { useAuth } from './context/AuthContext';
import type { Artist, SelectionMode } from './types/artist';
import { UsernamePrompt } from './components/Auth/UsernamePrompt';
import { ResetPasswordModal } from './components/Auth/ResetPasswordModal';
import { ViewingUserBanner, AnonymousUserBanner, FeaturedArtistsBanner } from './components/Banner';
import { UserNotFound } from './components/UserNotFound';
import { supabase } from './lib/supabase';
import { TutorialOverlay } from './components/Tutorial/TutorialOverlay';
import { useTutorialText, type TutorialAction } from './components/Tutorial/TutorialText';
import { ConfirmDialog, type ConfirmDialogVariant } from './components/ui';
import { Trans, useTranslation } from 'react-i18next';

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

function App() {
    const { username } = useParams<{ username?: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const { user, profile } = useAuth();
    const { t } = useTranslation();

    const [showForm, setShowForm] = useState(false);
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
    const [selectionMode, setSelectionMode] = useState<SelectionMode | null>(null);
    const [pendingCoordinates, setPendingCoordinates] = useState<{ lat: number; lng: number } | null>(null);
    const [focusedArtist, setFocusedArtist] = useState<Artist | null>(null);
    const [isCopyingCollection, setIsCopyingCollection] = useState(false);
    const [isMobileLayout, setIsMobileLayout] = useState(getIsMobileLayout);
    const [artistPopupOpen, setArtistPopupOpen] = useState(false);
    const [mainSearchResultsOpen, setMainSearchResultsOpen] = useState(false);
    const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);
    const [mainSearchCloseSignal, setMainSearchCloseSignal] = useState(0);
    const [tutorialStepIndex, setTutorialStepIndex] = useState<number | null>(null);
    const [isTutorialDismissed, setIsTutorialDismissed] = useState(false);
    const [tutorialArtistHasImage, setTutorialArtistHasImage] = useState(false);
    const [appDialog, setAppDialog] = useState<AppDialogState | null>(null);
    const [appDialogLoading, setAppDialogLoading] = useState(false);
    const tutorialSteps = useTutorialText();

    // Featured mode from URL param
    const viewingFeatured = searchParams.get('view') === 'featured';
    const setViewingFeatured = useCallback((featured: boolean) => {
        if (featured) {
            setSearchParams({ view: 'featured' });
            setShowFeaturedList(false);
        } else {
            setSearchParams({});
        }
    }, [setSearchParams]);

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

    const handleStartSelection = (targetField: 'originalLocation' | 'activeLocation') => {
        setSelectionMode({ active: true, targetField });
    };

    const handleLocationPick = (coordinates: { lat: number; lng: number } | null) => {
        setPendingCoordinates(coordinates);
        setSelectionMode(null);
    };

    const handleConsumeCoordinates = () => {
        setPendingCoordinates(null);
    };

    const handleEditArtist = (artist: Artist) => {
        if (!user) {
            setShowAuthModal(true);
            return;
        }
        setEditingArtist(artist);
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
                    components={{ strong: <strong className="font-semibold text-[rgb(220,38,38)]" /> }}
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
            setMainSearchCloseSignal((signal) => signal + 1);
            setShowForm(true);
            setTutorialArtistHasImage(false);
            if (tutorialStepIndex === 0) {
                setTutorialStepIndex(1);
            }
        }
    };

    const handleViewArtistListClick = () => {
        setShowForm(false);
        setMainSearchCloseSignal((signal) => signal + 1);
        setShowArtistList(true);
    };

    const handleEditFromList = (artist: Artist) => {
        setShowArtistList(false);
        handleEditArtist(artist);
    };

    const handleNavigateToArtist = (artist: Artist) => {
        setShowArtistList(false);
        setShowFeaturedList(false);
        setFocusedArtist(artist);
    };

    const handleArtistPopupOpenChange = useCallback((open: boolean) => {
        setArtistPopupOpen(open);

        if (!open || !isMobileLayout) return;
        // Mobile keeps one foreground surface open at a time.
        setShowForm(false);
        setShowArtistList(false);
        setShowFeaturedList(false);
        setMainSearchCloseSignal((signal) => signal + 1);
    }, [isMobileLayout]);

    const handleMainSearchResultsOpenChange = useCallback((open: boolean) => {
        setMainSearchResultsOpen(open);

        if (!open || !isMobileLayout) return;
        // Main search owns the mobile foreground while results are visible.
        setShowForm(false);
        setShowArtistList(false);
        setShowFeaturedList(false);
    }, [isMobileLayout]);

    // Lock map gestures under panels, except during location-pick mode.
    const mapInteractionsDisabled = (showForm && !selectionMode?.active)
        || (isMobileLayout && showArtistList)
        || (isMobileLayout && showFeaturedList)
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
                                count: <strong className="font-semibold text-primary" />,
                                username: <strong className="font-semibold text-primary" />,
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
                        t('app.dialogs.copyCollection.successMessage', { copied: result.copied, skipped: result.skipped }),
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
        <main className="h-screen w-screen flex flex-col">
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
                                    className="h-12 w-12 shrink-0 flex items-center justify-center bg-surface border border-border rounded-md shadow-md hover:bg-surface-muted active:bg-surface-muted transition-colors"
                                    title={t('banner.backToMyMap')}
                                >
                                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-text-secondary" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                        <polyline points="9 22 9 12 15 12 15 22" />
                                    </svg>
                                </button>
                            ) : (
                                <button
                                    aria-label={t('banner.viewCommunityArtists')}
                                    onClick={() => setViewingFeatured(true)}
                                    className="h-12 w-12 shrink-0 flex items-center justify-center bg-surface border border-border rounded-md shadow-md hover:bg-surface-muted active:bg-surface-muted transition-colors"
                                    title={t('banner.viewCommunityArtists')}
                                >
                                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-text-secondary" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polygon points="7.5,1.5 9,6 13.5,7.5 9,9 7.5,13.5 6,9 1.5,7.5 6,6" />
                                        <polygon points="18.5,6.5 19.5,9.5 22.5,10.5 19.5,11.5 18.5,14.5 17.5,11.5 14.5,10.5 17.5,9.5" />
                                        <polygon points="11.5,15.5 12.2,18 14.5,19 12.2,20 11.5,22.5 10.8,20 8.5,19 10.8,18" />
                                    </svg>
                                </button>
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

            {!showForm && (!isMobileLayout || !showArtistList) && !(isMobileLayout && artistPopupOpen) && user && profile?.isApproved && !isViewingOther && !viewingFeatured && (
                <AddArtistButton onClick={handleAddArtistClick} />
            )}
            {!showForm && (!isMobileLayout || !showArtistList) && !(isMobileLayout && artistPopupOpen) && user && (!viewingFeatured || !showFeaturedList || !isMobileLayout) && (
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
            {(showArtistList || (viewingFeatured && showFeaturedList)) && (
                <ArtistList
                    username={username}
                    viewingFeatured={viewingFeatured}
                    onClose={() => viewingFeatured ? setShowFeaturedList(false) : setShowArtistList(false)}
                    onNavigateToArtist={handleNavigateToArtist}
                    onEditArtist={isViewingOther || viewingFeatured ? undefined : handleEditFromList}
                    onDeleteArtist={isViewingOther || viewingFeatured ? undefined : handleDeleteArtist}
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
                selectionMode={selectionMode}
                onLocationPick={handleLocationPick}
                onEditArtist={isViewingOther || viewingFeatured || !user ? undefined : handleEditArtist}
                onDeleteArtist={isViewingOther || viewingFeatured || !user ? undefined : handleDeleteArtist}
                onEmptyClick={showForm ? handleCloseForm : showArtistList ? () => setShowArtistList(false) : undefined}
                focusedArtist={focusedArtist}
                onFocusedArtistHandled={() => setFocusedArtist(null)}
                isAuthenticated={!!user}
                suppressArtistPopup={isMobileLayout && (showForm || showArtistList || showFeaturedList || mainSearchResultsOpen)}
                onArtistPopupOpenChange={handleArtistPopupOpenChange}
                interactionsDisabled={mapInteractionsDisabled}
            />
        </main>
    );
};

export default App;
