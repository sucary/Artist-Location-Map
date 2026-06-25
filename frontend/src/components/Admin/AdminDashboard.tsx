import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { FormEvent, ReactNode } from 'react';
import { Spinner, Alert, Button, CloseButton, ConfirmDialog, type ConfirmDialogVariant } from '../ui';
import { CheckCircleIcon, ChevronDownIcon } from '../icons/GeneralIcons';
import {
    API_URL,
    deleteAdminPinnedNotification,
    getAdminPinnedNotifications,
    postAdminNotification,
    searchNotificationRecipients,
    type AdminPinnedNotification,
    type NotificationRecipient
} from '../../services/api';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import { LocalizationEditor } from './LocalizationEditor';
import { DarkModeInteractionTemplate } from './DarkModeInteractionTemplate';
import { formatLocalizedDate, formatLocalizedTime } from '../../utils/dateFormatting';

// Admin operations dashboard with moderation, notifications, and palette checks

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

const formatAdminDateTime = (value: string, dateOptions?: Intl.DateTimeFormatOptions, timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' }) => {
    const date = formatLocalizedDate(value, dateOptions);
    const time = formatLocalizedTime(value, timeOptions);
    return `${date} ${time}`;
};

interface AdminDialogState {
    title: string;
    message: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: ConfirmDialogVariant;
    onConfirm: () => void | Promise<void>;
}

const dialogTestVariants: ConfirmDialogVariant[] = ['default', 'danger', 'warning', 'success', 'error'];
const destructiveActionButtonClass = 'bg-surface-muted text-text hover:bg-[rgb(220,38,38)] hover:!text-white app-dark:bg-surface-secondary app-dark:hover:bg-[rgb(220,38,38)] app-dark:hover:!text-white';

export function AdminDashboard({ onClose }: AdminDashboardProps) {
    const { user, profile } = useAuth();
    const [pendingMediaReviews, setPendingMediaReviews] = useState<PendingMediaReview[]>([]);
    const [pinnedNotifications, setPinnedNotifications] = useState<AdminPinnedNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mediaReviewsOpen, setMediaReviewsOpen] = useState(true);
    const [postNotificationOpen, setPostNotificationOpen] = useState(false);
    const [pinnedNotificationsOpen, setPinnedNotificationsOpen] = useState(false);
    const [translationsOpen, setTranslationsOpen] = useState(false);
    const [statusTemplateOpen, setStatusTemplateOpen] = useState(false);
    const [darkModeTemplateOpen, setDarkModeTemplateOpen] = useState(false);
    const [notificationAudience, setNotificationAudience] = useState<'all' | 'user'>('all');
    const [notificationTitle, setNotificationTitle] = useState('');
    const [notificationContent, setNotificationContent] = useState('');
    const [notificationIsPinned, setNotificationIsPinned] = useState(false);
    const [recipientQuery, setRecipientQuery] = useState('');
    const [recipientResults, setRecipientResults] = useState<NotificationRecipient[]>([]);
    const [selectedRecipient, setSelectedRecipient] = useState<NotificationRecipient | null>(null);
    const [recipientSearchLoading, setRecipientSearchLoading] = useState(false);
    const [notificationPosting, setNotificationPosting] = useState(false);
    const [pinnedNotificationDeletingId, setPinnedNotificationDeletingId] = useState<string | null>(null);
    const [notificationPostError, setNotificationPostError] = useState<string | null>(null);
    const [notificationPostSuccess, setNotificationPostSuccess] = useState<string | null>(null);
    const [adminDialog, setAdminDialog] = useState<AdminDialogState | null>(null);
    const [adminDialogLoading, setAdminDialogLoading] = useState(false);

    const dialogRef = useDialogAccessibility(onClose);
    const sectionIds = {
        mediaReviews: 'admin-media-reviews',
        postNotification: 'admin-post-notification',
        pinnedNotifications: 'admin-pinned-notifications',
        translations: 'admin-location-translations',
        statusTemplate: 'admin-status-palette-template',
        darkModeTemplate: 'admin-dark-mode-interaction-template',
        recipients: 'admin-notification-recipients'
    };

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
            const [mediaResponse, pinned] = await Promise.all([
                fetch(`${API_URL}/upload/admin/media-reviews`, { headers }),
                getAdminPinnedNotifications(),
            ]);

            if (!mediaResponse.ok) {
                throw new Error('Failed to fetch media reviews');
            }

            setPendingMediaReviews(await mediaResponse.json());
            setPinnedNotifications(pinned);
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

    const handleDeletePinnedNotification = (notification: AdminPinnedNotification) => {
        setAdminDialog({
            title: 'Remove pinned notification?',
            message: (
                <>
                    <p>This removes the pinned notification for {notification.recipientCount} user{notification.recipientCount === 1 ? '' : 's'}.</p>
                    <p className="mt-2 font-medium text-text">{notification.title}</p>
                </>
            ),
            variant: 'danger',
            confirmLabel: 'Remove',
            cancelLabel: 'Cancel',
            onConfirm: async () => {
                setAdminDialogLoading(true);
                setPinnedNotificationDeletingId(notification.id);
                try {
                    const result = await deleteAdminPinnedNotification(notification.id);
                    setPinnedNotifications(prev => prev.filter(item => item.id !== notification.id));
                    setAdminDialog(null);
                    showAdminMessage('Pinned notification removed', `Removed ${result.deleted} notification${result.deleted === 1 ? '' : 's'}.`, 'success');
                } catch (err) {
                    showAdminMessage('Could not remove pinned notification', err instanceof Error ? err.message : 'Failed to remove pinned notification.', 'error');
                } finally {
                    setAdminDialogLoading(false);
                    setPinnedNotificationDeletingId(null);
                }
            },
        });
    };

    // Check if user is admin
    if (!user || !profile || !profile.isAdmin) {
        return null;
    }

    return (
        <>
        <div className="fixed inset-0 z-[1200]">
            {/* Dashboard Window */}
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-title"
                tabIndex={-1}
                className="relative flex h-full w-full flex-col overflow-hidden bg-surface focus:outline-none"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <h1 id="admin-title" className="text-lg font-bold text-text">Admin dashboard</h1>
                    <CloseButton onClick={onClose} size="md" />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {error && (
                        <Alert variant="error" header="Could not load admin data" className="mb-4">{error}</Alert>
                    )}

                    {/* Pending Artist Image Reviews */}
                    <div className="border-t border-border pt-4 mb-4">
                        <button
                            onClick={() => setMediaReviewsOpen(!mediaReviewsOpen)}
                            aria-expanded={mediaReviewsOpen}
                            aria-controls={sectionIds.mediaReviews}
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
                            <div id={sectionIds.mediaReviews} className="mt-2">
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
                                                            {formatAdminDateTime(review.createdAt, undefined, { hour: '2-digit', minute: '2-digit' })}
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
                                                            className={destructiveActionButtonClass}
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

                    {/* Post notification */}
                    <div className="border-t border-border pt-4 mb-4">
                        <button
                            onClick={() => setPostNotificationOpen(!postNotificationOpen)}
                            aria-expanded={postNotificationOpen}
                            aria-controls={sectionIds.postNotification}
                            className="w-full flex items-center justify-between gap-4 rounded-md px-3 py-3 text-left hover:bg-surface-muted transition-colors"
                        >
                            <h2 className="text-xl font-semibold text-text">Post notification</h2>
                            <ChevronDownIcon
                                aria-hidden="true"
                                className={`h-6 w-6 flex-shrink-0 text-text-muted transition-transform duration-200 ${postNotificationOpen ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {postNotificationOpen && (
                            <form id={sectionIds.postNotification} className="mt-2 border border-border rounded-lg p-4 space-y-4" onSubmit={handlePostNotification}>
                                {notificationPostError && (
                                    <Alert variant="error" header="Could not post notification" onClose={() => setNotificationPostError(null)}>{notificationPostError}</Alert>
                                )}
                                {notificationPostSuccess && (
                                    <Alert variant="success" header="Notification posted" onClose={() => setNotificationPostSuccess(null)}>{notificationPostSuccess}</Alert>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-text mb-2">Audience</label>
                                    <div role="radiogroup" aria-label="Notification audience" className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            role="radio"
                                            aria-checked={notificationAudience === 'all'}
                                            onClick={() => {
                                                setNotificationAudience('all');
                                                setSelectedRecipient(null);
                                            }}
                                            className={`px-3 py-2 rounded-md border text-sm font-medium ${notificationAudience === 'all' ? 'bg-primary-contrast text-white border-primary-contrast' : 'bg-surface text-text border-border-strong hover:bg-surface-muted'}`}
                                        >
                                            All users
                                        </button>
                                        <button
                                            type="button"
                                            role="radio"
                                            aria-checked={notificationAudience === 'user'}
                                            onClick={() => setNotificationAudience('user')}
                                            className={`px-3 py-2 rounded-md border text-sm font-medium ${notificationAudience === 'user' ? 'bg-primary-contrast text-white border-primary-contrast' : 'bg-surface text-text border-border-strong hover:bg-surface-muted'}`}
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
                                            role="combobox"
                                            aria-autocomplete="list"
                                            aria-controls={recipientResults.length > 0 ? sectionIds.recipients : undefined}
                                            aria-expanded={recipientResults.length > 0}
                                            aria-haspopup="listbox"
                                            aria-busy={recipientSearchLoading}
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
                                            <div id={sectionIds.recipients} role="listbox" aria-label="Notification recipient results" className="mt-2 border border-border rounded-md overflow-hidden">
                                                {recipientResults.map((recipient) => (
                                                    <button
                                                        key={recipient.id}
                                                        role="option"
                                                        aria-selected={selectedRecipient?.id === recipient.id}
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

                    {/* Pinned Notifications */}
                    <div className="border-t border-border pt-4 mb-4">
                        <button
                            onClick={() => setPinnedNotificationsOpen(!pinnedNotificationsOpen)}
                            aria-expanded={pinnedNotificationsOpen}
                            aria-controls={sectionIds.pinnedNotifications}
                            className="w-full flex items-center justify-between gap-4 rounded-md px-3 py-3 text-left hover:bg-surface-muted transition-colors"
                        >
                            <h2 className="text-xl font-semibold text-text">
                                Pinned Notifications ({pinnedNotifications.length})
                            </h2>
                            <ChevronDownIcon
                                aria-hidden="true"
                                className={`h-6 w-6 flex-shrink-0 text-text-muted transition-transform duration-200 ${pinnedNotificationsOpen ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {pinnedNotificationsOpen && (
                            <div id={sectionIds.pinnedNotifications} className="mt-2 px-3 pb-3">
                                {loading && (
                                    <div className="text-center py-6">
                                        <Spinner size="md" className="mx-auto text-primary" />
                                        <p className="text-text-secondary mt-2">Loading...</p>
                                    </div>
                                )}

                                {!loading && pinnedNotifications.length === 0 && (
                                    <div className="text-center py-6 text-text-secondary">
                                        <CheckCircleIcon className="w-10 h-10 mx-auto mb-2 text-text-muted" />
                                        <p>No pinned notifications</p>
                                    </div>
                                )}

                                {!loading && pinnedNotifications.length > 0 && (
                                    <div className="divide-y divide-border">
                                        {pinnedNotifications.map((notification) => (
                                            <div key={notification.id} className="py-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-semibold text-text">{notification.title}</p>
                                                        <p className="mt-1 max-h-10 overflow-hidden text-sm text-text-secondary">{notification.content}</p>
                                                        <p className="mt-2 text-xs text-text-muted">
                                                            {notification.recipientCount} recipient{notification.recipientCount === 1 ? '' : 's'} · {formatLocalizedDate(notification.createdAt)}
                                                        </p>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        onClick={() => handleDeletePinnedNotification(notification)}
                                                        isLoading={pinnedNotificationDeletingId === notification.id}
                                                        className="shrink-0 bg-[rgb(220,38,38)] hover:bg-[rgb(185,28,28)]"
                                                    >
                                                        Remove
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Location translations */}
                    <div className="border-t border-border pt-4">
                        <button
                            onClick={() => setTranslationsOpen(!translationsOpen)}
                            aria-expanded={translationsOpen}
                            aria-controls={sectionIds.translations}
                            className="w-full flex items-center justify-between gap-4 rounded-md px-3 py-3 text-left hover:bg-surface-muted transition-colors"
                        >
                            <h2 className="text-xl font-semibold text-text">Location translations</h2>
                            <ChevronDownIcon
                                aria-hidden="true"
                                className={`h-6 w-6 flex-shrink-0 text-text-muted transition-transform duration-200 ${translationsOpen ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {translationsOpen && (
                            <div id={sectionIds.translations} className="mt-2">
                                <LocalizationEditor />
                            </div>
                        )}
                    </div>

                    {/* Status palette template */}
                    <div className="border-t border-border pt-4">
                        <button
                            onClick={() => setStatusTemplateOpen(!statusTemplateOpen)}
                            aria-expanded={statusTemplateOpen}
                            aria-controls={sectionIds.statusTemplate}
                            className="w-full flex items-center justify-between gap-4 rounded-md px-3 py-3 text-left hover:bg-surface-muted transition-colors"
                        >
                            <h2 className="text-xl font-semibold text-text">Status palette template</h2>
                            <ChevronDownIcon
                                aria-hidden="true"
                                className={`h-6 w-6 flex-shrink-0 text-text-muted transition-transform duration-200 ${statusTemplateOpen ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {statusTemplateOpen && (
                            <div id={sectionIds.statusTemplate} className="mt-2 space-y-4 rounded-lg border border-border p-4">
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
                                        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[rgb(220,38,38)] app-dark:text-primary app-dark:font-bold">Error / Danger</p>
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
                                    <span className="rounded-md bg-[rgba(220,38,38,0.1)] px-2 py-1 text-xs font-medium text-[rgb(220,38,38)] app-dark:text-primary app-dark:font-bold">Failed</span>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <button type="button" className="rounded-md bg-primary-contrast px-3 py-1.5 text-xs font-medium text-white">Primary action</button>
                                    <button type="button" className="rounded-md bg-success px-3 py-1.5 text-xs font-medium text-white">Approve</button>
                                    <button type="button" className="rounded-md bg-surface-muted px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-[rgb(220,38,38)] hover:text-white app-dark:bg-surface-secondary app-dark:hover:bg-[rgb(220,38,38)]">Reject</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Dark mode interaction template */}
                    <div className="border-t border-border pt-4">
                        <button
                            onClick={() => setDarkModeTemplateOpen(!darkModeTemplateOpen)}
                            aria-expanded={darkModeTemplateOpen}
                            aria-controls={sectionIds.darkModeTemplate}
                            className="w-full flex items-center justify-between gap-4 rounded-md px-3 py-3 text-left hover:bg-surface-muted transition-colors"
                        >
                            <h2 className="text-xl font-semibold text-text">Dark mode interaction template</h2>
                            <ChevronDownIcon
                                aria-hidden="true"
                                className={`h-6 w-6 flex-shrink-0 text-text-muted transition-transform duration-200 ${darkModeTemplateOpen ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {darkModeTemplateOpen && (
                            <div id={sectionIds.darkModeTemplate} className="mt-2">
                                <DarkModeInteractionTemplate />
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
