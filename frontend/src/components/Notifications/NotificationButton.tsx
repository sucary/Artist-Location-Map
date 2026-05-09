import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import {
    clearNotifications,
    deleteNotification,
    getNotifications,
    default as api,
    type Notification
} from '../../services/api';
import { CloseButton } from '../ui';
import { NotificationContent } from './NotificationContent';
import type { PendingUser } from '../../types/profile';

type MenuNotification = Notification & {
    source: 'persisted' | 'synthetic';
};

function formatTimestamp(value: string) {
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(value));
}

function BellIcon() {
    return (
        <svg aria-hidden="true" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
    );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
    return (
        <svg
            aria-hidden="true"
            className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
        >
            <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function getNotificationColor(notification: MenuNotification) {
    if (notification.isHard) {
        if (notification.type.includes('error') || notification.type.includes('failed')) {
            return 'bg-error/10 border-surface-secondary';
        }
        return 'bg-warning/10 border-surface-secondary';
    }

    return 'bg-surface border-surface-secondary';
}

function NotificationItem({
    notification,
    onClose,
    onNavigate
}: {
    notification: MenuNotification;
    onClose: (id: string) => void;
    onNavigate: (url: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const canExpand = notification.content.length > 72;
    const contentId = `notification-content-${notification.id}`;

    return (
        <div
            data-notification-id={notification.id}
            className={`px-4 py-3 border-b last:border-b-0 ${getNotificationColor(notification)}`}
        >
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-text leading-snug">{notification.title}</p>
                        {!notification.isHard && (
                            <CloseButton
                                size="sm"
                                onClick={() => onClose(notification.id)}
                                aria-label="Close notification"
                                className="-mr-1 -mt-1"
                            />
                        )}
                    </div>
                    <p
                        id={contentId}
                        className="text-xs text-text-secondary mt-1 leading-relaxed overflow-hidden"
                        // Collapse long content by default.
                        style={expanded ? undefined : {
                            display: '-webkit-box',
                            WebkitLineClamp: 1,
                            WebkitBoxOrient: 'vertical'
                        }}
                    >
                        <NotificationContent content={notification.content} onNavigate={onNavigate} />
                    </p>
                    <div className="flex items-center justify-between gap-3 mt-2">
                        <span className="text-[11px] text-text-muted">{formatTimestamp(notification.createdAt)}</span>
                        <div className="flex items-center gap-3">
                            {canExpand && (
                                <button
                                    type="button"
                                    aria-expanded={expanded}
                                    aria-controls={contentId}
                                    className="flex items-center gap-0.5 text-xs font-medium text-text-secondary hover:text-primary"
                                    onClick={() => setExpanded((current) => !current)}
                                >
                                    {expanded ? 'Less' : 'More'}
                                    <ChevronIcon expanded={expanded} />
                                </button>
                            )}
                            {notification.linkLabel && notification.linkUrl && (
                                <button
                                    type="button"
                                    className="text-xs font-medium text-primary hover:text-primary-hover"
                                    onClick={() => onNavigate(notification.linkUrl!)}
                                >
                                    {notification.linkLabel}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface NotificationButtonProps {
    onOpenChange?: (open: boolean) => void;
}

export function NotificationButton({ onOpenChange }: NotificationButtonProps) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { profile } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [usesHoverMenu, setUsesHoverMenu] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const { data: persistedNotifications = [] } = useQuery({
        queryKey: ['notifications'],
        queryFn: getNotifications,
        enabled: !!profile,
        refetchInterval: 30000,
    });

    const { data: pendingUsers = [] } = useQuery({
        queryKey: ['pendingUsers'],
        queryFn: async () => {
            const response = await api.get<PendingUser[]>('/auth/admin/pending-users');
            return response.data;
        },
        enabled: !!profile?.isAdmin,
        refetchInterval: 30000,
    });

    const deleteMutation = useMutation({
        mutationFn: deleteNotification,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    });

    const clearMutation = useMutation({
        mutationFn: clearNotifications,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    });

    const syntheticNotifications = useMemo<MenuNotification[]>(() => {
        const now = new Date().toISOString();
        const notifications: MenuNotification[] = [];

        if (profile && !profile.isApproved) {
            notifications.push({
                id: 'account-pending-approval',
                userId: profile.id,
                type: 'account_pending_approval',
                title: 'Account pending approval',
                content: 'Your account is awaiting admin approval.',
                isRead: false,
                isHard: true,
                linkLabel: null,
                linkUrl: null,
                metadata: {},
                aggregationKey: 'account_pending_approval',
                createdAt: now,
                readAt: null,
                source: 'synthetic'
            });
        }

        if (profile?.isAdmin && pendingUsers.length > 0) {
            notifications.push({
                id: 'admin-pending-users',
                userId: profile.id,
                type: 'registration_pending',
                title: `${pendingUsers.length} pending approval${pendingUsers.length > 1 ? 's' : ''}`,
                content: 'Users are waiting for account approval.',
                isRead: false,
                isHard: true,
                linkLabel: 'Open admin',
                linkUrl: 'admin:dashboard',
                metadata: { count: pendingUsers.length },
                aggregationKey: 'admin_pending_users',
                createdAt: pendingUsers[0]?.createdAt ?? now,
                readAt: null,
                source: 'synthetic'
            });
        }

        return notifications;
    }, [pendingUsers, profile]);

    const notifications: MenuNotification[] = useMemo(() => {
        const persisted = persistedNotifications.map((notification) => ({
            ...notification,
            source: 'persisted' as const
        }));
        return [...syntheticNotifications, ...persisted].sort((a, b) => {
            if (a.isHard !== b.isHard) return a.isHard ? -1 : 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    }, [persistedNotifications, syntheticNotifications]);

    const hardNotifications = notifications.filter((notification) => notification.isHard);
    const normalNotifications = notifications.filter((notification) => !notification.isHard);
    const notificationCount = notifications.length;
    const canClear = notifications.some((notification) => !notification.isHard);
    const menuId = 'notifications-menu';

    useEffect(() => {
        // Desktop opens on hover; mobile keeps tap-to-toggle behavior.
        const mediaQuery = window.matchMedia('(min-width: 640px)');
        const syncHoverMode = () => setUsesHoverMenu(mediaQuery.matches);

        syncHoverMode();
        mediaQuery.addEventListener('change', syncHoverMode);
        return () => mediaQuery.removeEventListener('change', syncHoverMode);
    }, []);

    useEffect(() => {
        onOpenChange?.(isOpen);
    }, [isOpen, onOpenChange]);

    useEffect(() => {
        if (!isOpen) return;

        if (usesHoverMenu) return;

        // Outside click closes the mobile tap menu without blocking other controls.
        const handlePointerDown = (event: PointerEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [isOpen, usesHoverMenu]);

    if (notifications.length === 0) {
        return null;
    }

    const handleNavigate = (url: string) => {
        setIsOpen(false);
        if (url === 'admin:dashboard') {
            // Bridge header notification to App-owned dashboard modal.
            window.dispatchEvent(new CustomEvent('open-admin-dashboard'));
            return;
        }
        navigate(url);
    };

    const renderSection = (title: string, items: MenuNotification[]) => {
        if (items.length === 0) return null;

        return (
            <section>
                <div className="px-4 py-2 bg-surface-secondary text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    {title}
                </div>
                {items.map((notification) => (
                    <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onClose={(id) => deleteMutation.mutate(id)}
                        onNavigate={handleNavigate}
                    />
                ))}
            </section>
        );
    };

    return (
        <div
            ref={containerRef}
            className="relative"
            onMouseEnter={() => {
                if (usesHoverMenu) setIsOpen(true);
            }}
            onMouseLeave={() => {
                if (usesHoverMenu) setIsOpen(false);
            }}
        >
            <button
                aria-label={`Notifications (${notificationCount})`}
                aria-expanded={isOpen}
                aria-controls={isOpen ? menuId : undefined}
                aria-haspopup="dialog"
                onClick={() => {
                    if (!usesHoverMenu) setIsOpen((open) => !open);
                }}
                className="h-12 w-12 flex items-center justify-center bg-surface rounded-lg shadow-md hover:bg-surface-muted active:bg-surface-muted transition-colors text-text relative sm:h-13 sm:w-13"
            >
                <BellIcon />
                {notificationCount > 0 && (
                    <span
                        aria-hidden="true"
                        className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-warning text-white text-xs rounded-full flex items-center justify-center font-medium"
                    >
                        {notificationCount}
                    </span>
                )}
            </button>
            {isOpen && (
                <div id={menuId} role="dialog" aria-modal="false" aria-labelledby="notifications-title" className="fixed top-16 left-2 right-2 bg-surface rounded-lg shadow-lg border border-border z-[1250] overflow-hidden sm:top-2 sm:left-auto sm:right-[calc(12rem+1rem)] sm:w-80">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                        <h3 id="notifications-title" className="text-lg font-semibold text-text">Notifications</h3>
                        <div className="flex items-center gap-1">
                            {canClear && (
                                <button
                                    type="button"
                                    className="text-xs font-medium text-text-secondary hover:text-primary disabled:opacity-50"
                                    disabled={clearMutation.isPending}
                                    onClick={() => clearMutation.mutate()}
                                >
                                    Clear all
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                        {renderSection('Pinned', hardNotifications)}
                        {renderSection('Notifications', normalNotifications)}
                    </div>
                </div>
            )}
        </div>
    );
}
