import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { UserIcon } from '../icons/GeneralIcons';
import { FeedbackModal } from './FeedbackModal';

interface UserMenuProps {
    onOpenAdminDashboard?: () => void;
    onOpenChange?: (open: boolean) => void;
}

export function UserMenu({ onOpenAdminDashboard, onOpenChange }: UserMenuProps) {
    const navigate = useNavigate();
    const { user, profile, signOut } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

    useEffect(() => {
        onOpenChange?.(isOpen);
    }, [isOpen, onOpenChange]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (!user || !profile) return null;

    const handleSignOut = async () => {
        await signOut();
        setIsOpen(false);
        navigate('/');
    };

    return (
        <div ref={menuRef} className="relative">
            <button
                aria-expanded={isOpen}
                aria-haspopup="true"
                aria-label={t('userMenu.accountMenu')}
                onClick={() => setIsOpen(!isOpen)}
                className={`flex h-12 w-12 items-center justify-center gap-2 bg-surface shadow-md hover:bg-surface-muted active:bg-surface-muted transition-colors sm:h-auto sm:w-48 sm:justify-between sm:px-4 sm:py-2 ${isOpen ? 'rounded-lg sm:rounded-t-lg sm:rounded-b-none' : 'rounded-lg'}`}
            >
                <UserIcon className="h-6 w-6 text-text-secondary sm:hidden" />
                <div className="hidden flex-col items-start min-w-0 flex-1 gap-0.5 sm:flex">
                    <span className="text-sm font-medium text-text truncate w-full text-left h-5">
                        {profile.username || ''}
                    </span>
                    <span className="text-xs text-text-muted truncate w-full text-left">
                        {user.email}
                    </span>
                </div>
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div 
                    role="menu"
                    onKeyDown={(e) => { if (e.key === 'Escape') setIsOpen(false); }}
                    className="absolute top-full right-0 mt-1 w-48 bg-surface rounded-lg shadow-lg border border-border z-[1001] sm:mt-0 sm:rounded-t-none">
                    <button
                        role="menuitem"
                        onClick={() => {
                            navigate('/settings');
                            setIsOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-text hover:bg-surface-muted transition-colors"
                    >
                        {t('userMenu.settings')}
                    </button>
                    <button
                        role="menuitem"
                        onClick={() => {
                            setIsFeedbackOpen(true);
                            setIsOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-text hover:bg-surface-muted transition-colors"
                    >
                        {t('userMenu.feedback')}
                    </button>
                    {profile.isAdmin && onOpenAdminDashboard && (
                        <button
                            role="menuitem"
                            onClick={() => {
                                onOpenAdminDashboard();
                                setIsOpen(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-text hover:bg-surface-muted transition-colors"
                        >
                            {t('userMenu.adminDashboard.title')}
                        </button>
                    )}
                    <button
                        role="menuitem"
                        onClick={handleSignOut}
                        className="w-full text-left px-4 py-2 text-sm text-text hover:bg-surface-muted transition-colors rounded-b-lg"
                    >
                        {t('userMenu.signOut')}
                    </button>
                </div>
            )}
            {isFeedbackOpen && <FeedbackModal onClose={() => setIsFeedbackOpen(false)} />}
        </div>
    );
}
