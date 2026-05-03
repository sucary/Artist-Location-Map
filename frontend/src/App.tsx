import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import './App.css';
import { deleteArtist, getArtistsByUsername, getFeaturedArtists } from './services/api';
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
import type { LocationSearchResult } from './types/search';
import { UsernamePrompt } from './components/Auth/UsernamePrompt';
import { ResetPasswordModal } from './components/Auth/ResetPasswordModal';
import { ViewingUserBanner, AnonymousUserBanner, FeaturedArtistsBanner } from './components/Banner';
import { UserNotFound } from './components/UserNotFound';
import { supabase } from './lib/supabase';


function App() {
    const { username } = useParams<{ username?: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const { user, profile } = useAuth();

    const [showForm, setShowForm] = useState(false);
    const [showArtistList, setShowArtistList] = useState(false);
    const [showFeaturedList, setShowFeaturedList] = useState(true);
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
    const [focusedLocation, setFocusedLocation] = useState<{ lat: number; lng: number; locationType?: string } | null>(null);
    const [focusedCityId, setFocusedCityId] = useState<string | null>(null);

    // Featured mode from URL param
    const viewingFeatured = searchParams.get('view') === 'featured';
    const setViewingFeatured = useCallback((featured: boolean) => {
        if (featured) {
            setSearchParams({ view: 'featured' });
            setShowFeaturedList(true);
        } else {
            setSearchParams({});
        }
    }, [setSearchParams]);

    // Viewing another user's map
    const isViewingOther = !!username;

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
        setShowForm(true);
    };

    const handleCloseForm = () => {
        setShowForm(false);
        setEditingArtist(null);
        setSelectionMode(null);
    };

    const handleDeleteArtist = async (artist: Artist) => {
        if (!user) {
            setShowAuthModal(true);
            return;
        }

        if (!window.confirm(`Delete "${artist.name}"?`)) {
            return;
        }

        try {
            await deleteArtist(artist.id);
            await queryClient.invalidateQueries({ queryKey: ['artists'] });
        } catch (error) {
            console.error('Failed to delete artist:', error);
            alert('Failed to delete artist. Please try again.');
        }
    };

    const handleAddArtistClick = () => {
        if (!user) {
            setShowAuthModal(true);
        } else {
            setShowArtistList(false);
            setShowForm(true);
        }
    };

    const handleViewArtistListClick = () => {
        setShowForm(false);
        setShowArtistList(true);
    };

    const handleEditFromList = (artist: Artist) => {
        setShowArtistList(false);
        handleEditArtist(artist);
    };

    const handleNavigateToArtist = (artist: Artist) => {
        setShowArtistList(false);
        setFocusedArtist(artist);
    };

    // Search handlers
    const handleSearchFocusLocation = useCallback((result: LocationSearchResult) => {
        setFocusedLocation({ ...result.center, locationType: result.locationType });
        setFocusedCityId(result.id || null);
    }, []);

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
            {/* Top bar */}
            <div className="absolute top-2 left-2 z-[1100] flex items-center gap-2">
                {user && (
                    <>
                        <MainSearch
                            onFocusLocation={handleSearchFocusLocation}
                        />
                        {viewingFeatured ? (
                            <button
                                aria-label="Back to my map"
                                onClick={() => setViewingFeatured(false)}
                                className="h-12 w-12 flex items-center justify-center bg-surface border border-border rounded-md shadow-md hover:bg-surface-muted transition-colors"
                                title="Back to my map"
                            >
                                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-text-secondary" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                    <polyline points="9 22 9 12 15 12 15 22" />
                                </svg>
                            </button>
                        ) : (
                            <button
                                aria-label="View featured artists"
                                onClick={() => setViewingFeatured(true)}
                                className="h-12 w-12 flex items-center justify-center bg-surface border border-border rounded-md shadow-md hover:bg-surface-muted transition-colors"
                                title="View featured artists"
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

            {/* Top right controls */}
            <div className="absolute top-2 right-2 flex items-center gap-2">
                <div className="z-[1250]">
                    {user && <NotificationButton />}
                </div>
                <div className="z-[1100]">
                    <AccountButton
                        showAuthModal={showAuthModal}
                        onOpenAuthModal={() => setShowAuthModal(true)}
                        onCloseAuthModal={() => setShowAuthModal(false)}
                        onOpenAdminDashboard={() => setShowAdminDashboard(true)}
                    />
                </div>
            </div>

            {/* Bottom center: Viewing banner, Featured banner, or Anonymous banner */}
            {isViewingOther && username ? (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1100]">
                    <ViewingUserBanner username={username} />
                </div>
            ) : viewingFeatured && user ? (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1100]">
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

            {/* Bottom left: About link */}
            {!showAuthModal && (
                <Link
                    to="/about"
                    className="absolute bottom-8 left-[10px] z-[1100] p-1.5 rounded-md shadow-md bg-surface hover:bg-surface-muted text-text-muted hover:text-text-secondary transition-colors"
                    title="About"
                >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7.9 7a4 4 0 0 1 7.5 2c0 2-3.4 3-3.4 6" />
                        <circle cx="12" cy="19" r="0.5" fill="currentColor" />
                    </svg>
                </Link>
            )}

            {/* Show username prompt for OAuth users without username */}
            {user && profile && !profile.username && (
                <UsernamePrompt onComplete={() => {
                    queryClient.invalidateQueries({ queryKey: ['profile'] });
                }} />
            )}

            {!showForm && !showArtistList && user && profile?.isApproved && !isViewingOther && !viewingFeatured && (
                <AddArtistButton onClick={handleAddArtistClick} />
            )}
            {!showForm && !showArtistList && user && (!viewingFeatured || !showFeaturedList) && (
                <ViewArtistListButton onClick={() => {
                    if (viewingFeatured) {
                        setShowFeaturedList(true);
                    } else {
                        handleViewArtistListClick();
                    }
                }} />
            )}
            {showForm && (
                <ArtistForm
                    key={editingArtist?.id ?? 'new'}
                    initialData={editingArtist ?? undefined}
                    onCancel={handleCloseForm}
                    onRequestSelection={handleStartSelection}
                    pendingCoordinates={pendingCoordinates}
                    onConsumePendingCoordinates={handleConsumeCoordinates}
                />
            )}
            {(showArtistList || (viewingFeatured && showFeaturedList)) && (
                <ArtistList
                    username={username}
                    viewingFeatured={viewingFeatured}
                    onClose={() => viewingFeatured ? setShowFeaturedList(false) : setShowArtistList(false)}
                    onNavigateToArtist={handleNavigateToArtist}
                    onEditArtist={isViewingOther || viewingFeatured ? undefined : handleEditFromList}
                    onDeleteArtist={isViewingOther || viewingFeatured ? undefined : handleDeleteArtist}
                />
            )}
            {showAdminDashboard && (
                <AdminDashboard onClose={() => setShowAdminDashboard(false)} />
            )}
            {showResetPassword && (
                <ResetPasswordModal onClose={() => setShowResetPassword(false)} />
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
                focusedLocation={focusedLocation}
                onFocusedLocationHandled={() => setFocusedLocation(null)}
                focusedCityId={focusedCityId}
                isAuthenticated={!!user}
            />
        </main>
    );
};

export default App;
