import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Spinner, Alert, Button, CloseButton } from '../ui';
import { CheckCircleIcon, ChevronDownIcon } from '../icons/GeneralIcons';
import { API_URL } from '../../services/api';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import type { PendingUser } from '../../types/profile';
import { LocalizationEditor } from './LocalizationEditor';

interface AdminDashboardProps {
    onClose: () => void;
}

interface PendingMediaReview {
    id: string;
    musicbrainzMbid: string;
    artistName: string;
    sourceImage: string;
    currentSourceImage?: string | null;
    submittedByUsername?: string | null;
    submittedByEmail?: string | null;
    createdAt: string;
}

export function AdminDashboard({ onClose }: AdminDashboardProps) {
    const { user, profile } = useAuth();
    const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
    const [pendingMediaReviews, setPendingMediaReviews] = useState<PendingMediaReview[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [approvalsOpen, setApprovalsOpen] = useState(true);
    const [mediaReviewsOpen, setMediaReviewsOpen] = useState(true);
    const [translationsOpen, setTranslationsOpen] = useState(false);

    const dialogRef = useDialogAccessibility(onClose);

    useEffect(() => {
        void fetchAdminData();
    }, []);

    // Close modal on esc pressed
    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                onClose();
            }
        }
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
        }, [onClose]);

    const getAuthHeaders = async () => {
        const { supabase } = await import('../../lib/supabase');
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            throw new Error('No authentication token found');
        }

        return {
            'Authorization': `Bearer ${session.access_token}`,
        };
    };

    const fetchAdminData = async () => {
        setLoading(true);
        setError(null);
        try {
            const headers = await getAuthHeaders();
            const [usersResponse, mediaResponse] = await Promise.all([
                fetch(`${API_URL}/auth/admin/pending-users`, { headers }),
                fetch(`${API_URL}/upload/admin/media-reviews`, { headers }),
            ]);

            if (!usersResponse.ok) {
                throw new Error('Failed to fetch pending users');
            }
            if (!mediaResponse.ok) {
                throw new Error('Failed to fetch media reviews');
            }

            setPendingUsers(await usersResponse.json());
            setPendingMediaReviews(await mediaResponse.json());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load admin data');
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (userId: string) => {
        try {
            const headers = await getAuthHeaders();

            const response = await fetch(`${API_URL}/auth/admin/approve/${userId}`, {
                method: 'POST',
                headers,
            });

            if (!response.ok) {
                throw new Error('Failed to approve user');
            }

            // Remove from list
            setPendingUsers(prev => prev.filter(u => u.id !== userId));
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to approve user');
        }
    };

    const handleReject = async (userId: string) => {
        if (!confirm('Are you sure you want to reject and remove this user?')) {
            return;
        }

        try {
            const headers = await getAuthHeaders();

            const response = await fetch(`${API_URL}/auth/admin/reject/${userId}`, {
                method: 'POST',
                headers,
            });

            if (!response.ok) {
                throw new Error('Failed to reject user');
            }

            // Remove from list
            setPendingUsers(prev => prev.filter(u => u.id !== userId));
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to reject user');
        }
    };

    const handleMediaReview = async (reviewId: string, action: 'approve' | 'reject') => {
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_URL}/upload/admin/media-reviews/${reviewId}/${action}`, {
                method: 'POST',
                headers,
            });

            if (!response.ok) {
                throw new Error(`Failed to ${action} media review`);
            }

            setPendingMediaReviews(prev => prev.filter(review => review.id !== reviewId));
        } catch (err) {
            alert(err instanceof Error ? err.message : `Failed to ${action} media review`);
        }
    };

    // Check if user is admin
    if (!user || !profile || !profile.isAdmin) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center">
            {/* Backdrop */}
            <div aria-hidden="true" className="absolute inset-0" onClick={onClose} />

            {/* Dashboard Window */}
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-title"
                tabIndex={-1}
                className="relative bg-surface rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[80vh] overflow-hidden flex flex-col focus:outline-none"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <h1 id="admin-title" className="text-lg font-bold text-text">Admin Dashboard</h1>
                    <CloseButton onClick={onClose} size="md" />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">

                    {/* Pending User Approvals */}
                    <div className="mb-4">
                        <button
                            onClick={() => setApprovalsOpen(!approvalsOpen)}
                            className="w-full flex items-center justify-between gap-4 rounded-md px-3 py-3 text-left hover:bg-surface-muted transition-colors"
                        >
                            <h2 className="text-xl font-semibold text-text">
                                Pending User Approvals ({pendingUsers.length})
                            </h2>
                            <ChevronDownIcon
                                aria-hidden="true"
                                className={`h-6 w-6 flex-shrink-0 text-text-muted transition-transform duration-200 ${approvalsOpen ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {approvalsOpen && (
                            <div className="mt-2">
                                {loading && (
                                    <div className="text-center py-8">
                                        <Spinner size="lg" className="mx-auto text-primary" />
                                        <p className="text-text-secondary mt-2">Loading...</p>
                                    </div>
                                )}

                                {error && (
                                    <Alert variant="error" className="mb-4">{error}</Alert>
                                )}

                                {!loading && !error && pendingUsers.length === 0 && (
                                    <div className="text-center py-8 text-text-secondary">
                                        <CheckCircleIcon className="w-12 h-12 mx-auto mb-2 text-text-muted" />
                                        <p>No pending approvals</p>
                                    </div>
                                )}

                                {!loading && !error && pendingUsers.length > 0 && (
                                    <div className="space-y-3">
                                        {pendingUsers.map(user => (
                                            <div key={user.id} className="border border-border rounded-lg p-4 flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium text-text">{user.username || 'No username'}</p>
                                                    <p className="text-sm text-text-secondary">{user.email}</p>
                                                    <p className="text-xs text-text-muted mt-1">
                                                        Registered: {new Date(user.createdAt).toLocaleDateString('fi-FI')} {new Date(user.createdAt).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\./g, ':')}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button
                                                        onClick={() => handleApprove(user.id)}
                                                        className="bg-green-600 hover:bg-green-700"
                                                    >
                                                        Approve
                                                    </Button>
                                                    <Button
                                                        onClick={() => handleReject(user.id)}
                                                        className="bg-red-600 hover:bg-red-700"
                                                    >
                                                        Reject
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Pending Artist Image Reviews */}
                    <div className="border-t border-border pt-4 mb-4">
                        <button
                            onClick={() => setMediaReviewsOpen(!mediaReviewsOpen)}
                            className="w-full flex items-center justify-between gap-4 rounded-md px-3 py-3 text-left hover:bg-surface-muted transition-colors"
                        >
                            <h2 className="text-xl font-semibold text-text">
                                Artist Image Reviews ({pendingMediaReviews.length})
                            </h2>
                            <ChevronDownIcon
                                aria-hidden="true"
                                className={`h-6 w-6 flex-shrink-0 text-text-muted transition-transform duration-200 ${mediaReviewsOpen ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {mediaReviewsOpen && (
                            <div className="mt-2">
                                {loading && (
                                    <div className="text-center py-8">
                                        <Spinner size="lg" className="mx-auto text-primary" />
                                        <p className="text-text-secondary mt-2">Loading...</p>
                                    </div>
                                )}

                                {!loading && pendingMediaReviews.length === 0 && (
                                    <div className="text-center py-8 text-text-secondary">
                                        <CheckCircleIcon className="w-12 h-12 mx-auto mb-2 text-text-muted" />
                                        <p>No pending image reviews</p>
                                    </div>
                                )}

                                {!loading && pendingMediaReviews.length > 0 && (
                                    <div className="space-y-4">
                                        {pendingMediaReviews.map(review => (
                                            <div key={review.id} className="border border-border rounded-lg p-4">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div>
                                                        <p className="text-sm font-semibold text-text">{review.artistName}</p>
                                                        <p className="text-xs text-text-secondary">
                                                            Submitted by {review.submittedByUsername || review.submittedByEmail || 'Unknown user'}
                                                        </p>
                                                        <p className="text-xs text-text-muted mt-1">
                                                            {new Date(review.createdAt).toLocaleDateString('fi-FI')} {new Date(review.createdAt).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }).replace(/\./g, ':')}
                                                        </p>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            onClick={() => handleMediaReview(review.id, 'approve')}
                                                            className="bg-green-600 hover:bg-green-700"
                                                        >
                                                            Approve
                                                        </Button>
                                                        <Button
                                                            onClick={() => handleMediaReview(review.id, 'reject')}
                                                            className="bg-red-600 hover:bg-red-700"
                                                        >
                                                            Reject
                                                        </Button>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3 mt-4">
                                                    <div>
                                                        <p className="text-xs font-medium text-text-secondary mb-1">Current</p>
                                                        {review.currentSourceImage ? (
                                                            <img
                                                                src={review.currentSourceImage}
                                                                alt={`${review.artistName} current`}
                                                                className="w-full aspect-video object-cover rounded border border-border bg-surface-muted"
                                                            />
                                                        ) : (
                                                            <div className="w-full aspect-video rounded border border-border bg-surface-muted flex items-center justify-center text-xs text-text-secondary">
                                                                No image
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-medium text-text-secondary mb-1">Proposed</p>
                                                        <img
                                                            src={review.sourceImage}
                                                            alt={`${review.artistName} proposed`}
                                                            className="w-full aspect-video object-cover rounded border border-border bg-surface-muted"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Location Translations */}
                    <div className="border-t border-border pt-4">
                        <button
                            onClick={() => setTranslationsOpen(!translationsOpen)}
                            className="w-full flex items-center justify-between gap-4 rounded-md px-3 py-3 text-left hover:bg-surface-muted transition-colors"
                        >
                            <h2 className="text-xl font-semibold text-text">Location Translations</h2>
                            <ChevronDownIcon
                                aria-hidden="true"
                                className={`h-6 w-6 flex-shrink-0 text-text-muted transition-transform duration-200 ${translationsOpen ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {translationsOpen && (
                            <div className="mt-2">
                                <LocalizationEditor />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
