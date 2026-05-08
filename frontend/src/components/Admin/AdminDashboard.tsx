import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { FormEvent, ReactNode } from 'react';
import { Spinner, Alert, Button, CloseButton, ConfirmDialog, type ConfirmDialogVariant } from '../ui';
import { CheckCircleIcon, ChevronDownIcon } from '../icons/GeneralIcons';
import {
    API_URL,
    postAdminNotification,
    searchNotificationRecipients,
    type NotificationRecipient
} from '../../services/api';
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

interface AdminDialogState {
    title: string;
    message: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: ConfirmDialogVariant;
    onConfirm: () => void | Promise<void>;
}

const dialogTestVariants: ConfirmDialogVariant[] = ['default', 'danger', 'warning', 'success', 'error'];

export function AdminDashboard({ onClose }: AdminDashboardProps) {
    const { user, profile } = useAuth();
    const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
    const [pendingMediaReviews, setPendingMediaReviews] = useState<PendingMediaReview[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [approvalsOpen, setApprovalsOpen] = useState(true);
    const [mediaReviewsOpen, setMediaReviewsOpen] = useState(true);
    const [postNotificationOpen, setPostNotificationOpen] = useState(false);
    const [translationsOpen, setTranslationsOpen] = useState(false);
    const [statusTemplateOpen, setStatusTemplateOpen] = useState(false);
    const [notificationAudience, setNotificationAudience] = useState<'all' | 'user'>('all');
    const [notificationTitle, setNotificationTitle] = useState('');
    const [notificationContent, setNotificationContent] = useState('');
    const [notificationIsPinned, setNotificationIsPinned] = useState(false);
    const [recipientQuery, setRecipientQuery] = useState('');
    const [recipientResults, setRecipientResults] = useState<NotificationRecipient[]>([]);
    const [selectedRecipient, setSelectedRecipient] = useState<NotificationRecipient | null>(null);
    const [recipientSearchLoading, setRecipientSearchLoading] = useState(false);
    const [notificationPosting, setNotificationPosting] = useState(false);
    const [notificationPostError, setNotificationPostError] = useState<string | null>(null);
    const [notificationPostSuccess, setNotificationPostSuccess] = useState<string | null>(null);
    const [adminDialog, setAdminDialog] = useState<AdminDialogState | null>(null);
    const [adminDialogLoading, setAdminDialogLoading] = useState(false);

    const dialogRef = useDialogAccessibility(onClose);

    useEffect(() => {
        // Search recipients only after the admin chooses a specific-user audience.
        if (notificationAudience !== 'user' || selectedRecipient || recipientQuery.trim().length < 2) {
            setRecipientResults([]);
            setRecipientSearchLoading(false);
            return;
        }

        let cancelled = false;
        setRecipientSearchLoading(true);
        const timeoutId = window.setTimeout(() => {
            searchNotificationRecipients(recipientQuery)
                .then((results) => {
                    if (!cancelled) {
                        setRecipientResults(results);
                    }
                })
                .catch(() => {
                    if (!cancelled) {
                        setRecipientResults([]);
                    }
                })
                .finally(() => {
                    if (!cancelled) {
                        setRecipientSearchLoading(false);
                    }
                });
        }, 250);

        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [notificationAudience, recipientQuery, selectedRecipient]);

    // Close the modal when Escape is pressed.
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

    useEffect(() => {
        void fetchAdminData();
        // Admin data should load once when the dashboard opens.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const showAdminMessage = (
        title: string,
        message: ReactNode,
        variant: ConfirmDialogVariant = 'default'
    ) => {
        setAdminDialog({
            title,
            message,
            variant,
            confirmLabel: 'OK',
            onConfirm: () => setAdminDialog(null),
        });
    };

    const handleOpenTestDialog = (variant: ConfirmDialogVariant) => {
        setAdminDialog({
            title: `${variant.charAt(0).toUpperCase()}${variant.slice(1)} dialog`,
            message: (
                <>
                    <p>This checks the shared {variant} dialog style.</p>
                    <p className="mt-1">Try keyboard focus, Escape, backdrop click, cancel, and confirm.</p>
                </>
            ),
            variant,
            confirmLabel: 'Looks good',
            cancelLabel: 'Close',
            onConfirm: () => setAdminDialog(null),
        });
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

            setPendingUsers(prev => prev.filter(u => u.id !== userId));
        } catch (err) {
            showAdminMessage('Could not approve user', err instanceof Error ? err.message : 'Failed to approve user', 'error');
        }
    };

    const handleReject = async (userId: string) => {
        setAdminDialog({
            title: 'Reject user?',
            message: 'Rejecting this user will remove the account request.',
            variant: 'danger',
            confirmLabel: 'Reject',
            cancelLabel: 'Cancel',
            onConfirm: async () => {
                setAdminDialogLoading(true);
                try {
                    const headers = await getAuthHeaders();

                    const response = await fetch(`${API_URL}/auth/admin/reject/${userId}`, {
                        method: 'POST',
                        headers,
                    });

                    if (!response.ok) {
                        throw new Error('Failed to reject user');
                    }

                    setPendingUsers(prev => prev.filter(u => u.id !== userId));
                    setAdminDialog(null);
                } catch (err) {
                    showAdminMessage('Could not reject user', err instanceof Error ? err.message : 'Failed to reject user', 'error');
                } finally {
                    setAdminDialogLoading(false);
                }
            },
        });
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
            showAdminMessage('Could not update media review', err instanceof Error ? err.message : `Failed to ${action} media review`, 'error');
        }
    };

    const resetNotificationForm = () => {
        // Clear post state after a successful send while preserving the selected audience.
        setNotificationTitle('');
        setNotificationContent('');
        setNotificationIsPinned(false);
        setRecipientQuery('');
        setRecipientResults([]);
        setSelectedRecipient(null);
    };

    const handlePostNotification = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setNotificationPostError(null);
        setNotificationPostSuccess(null);

        const trimmedTitle = notificationTitle.trim();
        const trimmedContent = notificationContent.trim();

        if (!trimmedTitle || !trimmedContent) {
            setNotificationPostError('Title and content are required.');
            return;
        }

        if (notificationAudience === 'user' && !selectedRecipient) {
            setNotificationPostError('Choose a recipient before posting.');
            return;
        }

        setNotificationPosting(true);
        try {
            const result = await postAdminNotification({
                audience: notificationAudience,
                userId: notificationAudience === 'user' ? selectedRecipient!.id : undefined,
                title: trimmedTitle,
                content: trimmedContent,
                isHard: notificationIsPinned
            });
            setNotificationPostSuccess(`Posted to ${result.sent} user${result.sent === 1 ? '' : 's'}.`);
            resetNotificationForm();
        } catch (err) {
            setNotificationPostError(err instanceof Error ? err.message : 'Failed to post notification.');
        } finally {
            setNotificationPosting(false);
        }
    };

    // Check if user is admin
    if (!user || !profile || !profile.isAdmin) {
        return null;
    }

    return (
        <>
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
                    {error && (
                        <Alert variant="error" header="Could not load admin data" className="mb-4">{error}</Alert>
                    )}

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

                                {!loading && pendingUsers.length === 0 && (
                                    <div className="text-center py-8 text-text-secondary">
                                        <CheckCircleIcon className="w-12 h-12 mx-auto mb-2 text-text-muted" />
                                        <p>No pending approvals</p>
                                    </div>
                                )}

                                {!loading && pendingUsers.length > 0 && (
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
                                                        className="bg-success hover:bg-success/90"
                                                    >
                                                        Approve
                                                    </Button>
                                                    <Button
                                                        onClick={() => handleReject(user.id)}
                                                        className="bg-error hover:bg-error/90"
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
                                                            className="bg-success hover:bg-success/90"
                                                        >
                                                            Approve
                                                        </Button>
                                                        <Button
                                                            onClick={() => handleMediaReview(review.id, 'reject')}
                                                            className="bg-error hover:bg-error/90"
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

                    {/* Post Notification */}
                    <div className="border-t border-border pt-4 mb-4">
                        <button
                            onClick={() => setPostNotificationOpen(!postNotificationOpen)}
                            className="w-full flex items-center justify-between gap-4 rounded-md px-3 py-3 text-left hover:bg-surface-muted transition-colors"
                        >
                            <h2 className="text-xl font-semibold text-text">Post Notification</h2>
                            <ChevronDownIcon
                                aria-hidden="true"
                                className={`h-6 w-6 flex-shrink-0 text-text-muted transition-transform duration-200 ${postNotificationOpen ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {postNotificationOpen && (
                            <form className="mt-2 border border-border rounded-lg p-4 space-y-4" onSubmit={handlePostNotification}>
                                {notificationPostError && (
                                    <Alert variant="error" header="Could not post notification" onClose={() => setNotificationPostError(null)}>{notificationPostError}</Alert>
                                )}
                                {notificationPostSuccess && (
                                    <Alert variant="success" header="Notification posted" onClose={() => setNotificationPostSuccess(null)}>{notificationPostSuccess}</Alert>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-text mb-2">Audience</label>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setNotificationAudience('all');
                                                setSelectedRecipient(null);
                                            }}
                                            className={`px-3 py-2 rounded-md border text-sm font-medium ${notificationAudience === 'all' ? 'bg-primary text-white border-primary' : 'bg-surface text-text border-border-strong hover:bg-surface-secondary'}`}
                                        >
                                            All users
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setNotificationAudience('user')}
                                            className={`px-3 py-2 rounded-md border text-sm font-medium ${notificationAudience === 'user' ? 'bg-primary text-white border-primary' : 'bg-surface text-text border-border-strong hover:bg-surface-secondary'}`}
                                        >
                                            Specific user
                                        </button>
                                    </div>
                                </div>

                                {notificationAudience === 'user' && (
                                    <div>
                                        <label htmlFor="notification-recipient" className="block text-sm font-medium text-text mb-1">
                                            Recipient
                                        </label>
                                        <input
                                            id="notification-recipient"
                                            type="text"
                                            value={selectedRecipient ? selectedRecipient.username || selectedRecipient.email : recipientQuery}
                                            onChange={(event) => {
                                                setSelectedRecipient(null);
                                                setRecipientQuery(event.target.value);
                                            }}
                                            placeholder="Search username or email"
                                            className="w-full px-3 py-2 bg-surface border border-border-strong rounded-md text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-inset focus:ring-primary"
                                        />
                                        {recipientSearchLoading && (
                                            <p className="text-xs text-text-secondary mt-1">Searching...</p>
                                        )}
                                        {!recipientSearchLoading && recipientResults.length > 0 && (
                                            <div className="mt-2 border border-border rounded-md overflow-hidden">
                                                {recipientResults.map((recipient) => (
                                                    <button
                                                        key={recipient.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedRecipient(recipient);
                                                            setRecipientQuery('');
                                                            setRecipientResults([]);
                                                        }}
                                                        className="w-full text-left px-3 py-2 hover:bg-surface-muted border-b border-border last:border-b-0"
                                                    >
                                                        <span className="block text-sm font-medium text-text">{recipient.username || 'No username'}</span>
                                                        <span className="block text-xs text-text-secondary">{recipient.email}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div>
                                    <label htmlFor="notification-title" className="block text-sm font-medium text-text mb-1">Title</label>
                                    <input
                                        id="notification-title"
                                        type="text"
                                        maxLength={120}
                                        value={notificationTitle}
                                        onChange={(event) => setNotificationTitle(event.target.value)}
                                        className="w-full px-3 py-2 bg-surface border border-border-strong rounded-md text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-inset focus:ring-primary"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="notification-content" className="block text-sm font-medium text-text mb-1">Content</label>
                                    <p className="text-xs text-text-secondary mb-2">
                                        Add links as [link text](/internal-path) or [link text](https://example.com).
                                    </p>
                                    <textarea
                                        id="notification-content"
                                        maxLength={1000}
                                        rows={4}
                                        value={notificationContent}
                                        onChange={(event) => setNotificationContent(event.target.value)}
                                        className="w-full px-3 py-2 bg-surface border border-border-strong rounded-md text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-inset focus:ring-primary resize-y"
                                    />
                                </div>

                                <label className="flex items-center gap-2 text-sm text-text">
                                    <input
                                        type="checkbox"
                                        checked={notificationIsPinned}
                                        onChange={(event) => setNotificationIsPinned(event.target.checked)}
                                        className="h-4 w-4 rounded border-border-strong text-primary focus:ring-primary"
                                    />
                                    Pinned
                                </label>

                                <div className="flex justify-end">
                                    <Button type="submit" isLoading={notificationPosting}>
                                        Post notification
                                    </Button>
                                </div>
                            </form>
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

                    {/* Status Palette Template */}
                    <div className="border-t border-border pt-4">
                        <button
                            onClick={() => setStatusTemplateOpen(!statusTemplateOpen)}
                            className="w-full flex items-center justify-between gap-4 rounded-md px-3 py-3 text-left hover:bg-surface-muted transition-colors"
                        >
                            <h2 className="text-xl font-semibold text-text">Status Palette Template</h2>
                            <ChevronDownIcon
                                aria-hidden="true"
                                className={`h-6 w-6 flex-shrink-0 text-text-muted transition-transform duration-200 ${statusTemplateOpen ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {statusTemplateOpen && (
                            <div className="mt-2 space-y-4 rounded-lg border border-border p-4">
                                <div className="flex flex-wrap gap-1.5">
                                    {dialogTestVariants.map((variant) => (
                                        <button
                                            key={variant}
                                            type="button"
                                            onClick={() => handleOpenTestDialog(variant)}
                                            className="rounded-md border border-border bg-surface-secondary px-2.5 py-1.5 text-xs font-medium capitalize text-text-secondary transition-colors hover:bg-surface-muted active:bg-surface-muted"
                                        >
                                            {variant}
                                        </button>
                                    ))}
                                </div>

                                <div className="grid gap-2 sm:grid-cols-3">
                                    <div className="rounded-md border border-success/30 bg-success/10 p-3">
                                        <div className="h-5 w-full rounded bg-success" />
                                        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-success">Success</p>
                                        <p className="text-xs text-text-secondary">#009E73</p>
                                    </div>
                                    <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
                                        <div className="h-5 w-full rounded bg-warning" />
                                        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-warning">Warning / Notice</p>
                                        <p className="text-xs text-text-secondary">#E69F00</p>
                                    </div>
                                    <div className="rounded-md border border-[rgba(220,38,38,0.3)] bg-[rgba(220,38,38,0.1)] p-3">
                                        <div className="h-5 w-full rounded bg-[rgb(220,38,38)]" />
                                        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[rgb(220,38,38)]">Error / Danger</p>
                                        <p className="text-xs text-text-secondary">#DC2626</p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Alert variant="success" header="Verification email sent">
                                        Please check your inbox and click the link to verify your account.
                                    </Alert>
                                    <Alert variant="warning" header="Account will be locked">
                                        You have 1 attempt left. The account will be locked for 15 minutes after another failed login.
                                    </Alert>
                                    <Alert variant="error" header="Incorrect password">
                                        The email or password is incorrect. Please try again.
                                    </Alert>
                                </div>

                                <div className="rounded-md border border-border p-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-warning">Warning</p>
                                    <h3 className="mt-1 text-sm font-semibold text-text">Unsaved change example</h3>
                                    <p className="mt-2 text-sm text-text-secondary">
                                        This mirrors the dialog header treatment: semantic label, neutral title, neutral body.
                                    </p>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <span className="rounded-md bg-success/10 px-2 py-1 text-xs font-medium text-success">Saved</span>
                                    <span className="rounded-md bg-warning/10 px-2 py-1 text-xs font-medium text-warning">Needs review</span>
                                    <span className="rounded-md bg-[rgba(220,38,38,0.1)] px-2 py-1 text-xs font-medium text-[rgb(220,38,38)]">Failed</span>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white">Primary action</button>
                                    <button type="button" className="rounded-md bg-success px-3 py-1.5 text-xs font-medium text-white">Approve</button>
                                    <button type="button" className="rounded-md bg-[rgb(220,38,38)] px-3 py-1.5 text-xs font-medium text-white">Reject</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
        {adminDialog && (
            <ConfirmDialog
                open
                title={adminDialog.title}
                variant={adminDialog.variant}
                confirmLabel={adminDialog.confirmLabel}
                cancelLabel={adminDialog.cancelLabel}
                isLoading={adminDialogLoading}
                onCancel={() => setAdminDialog(null)}
                onConfirm={() => { void adminDialog.onConfirm(); }}
            >
                {adminDialog.message}
            </ConfirmDialog>
        )}
        </>
    );
}
