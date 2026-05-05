import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';

interface UserMenuProps {
    onOpenAdminDashboard?: () => void;
}

export function UserMenu({ onOpenAdminDashboard }: UserMenuProps) {
    const navigate = useNavigate();
    const { user, profile, signOut } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();

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
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center justify-between gap-2 px-4 py-2 bg-surface shadow-md hover:bg-surface-muted transition-colors w-48 ${isOpen ? 'rounded-t-lg' : 'rounded-lg'}`}
            >
                <div className="flex flex-col items-start min-w-0 flex-1 gap-0.5">
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
                    className="absolute top-full right-0 w-48 bg-surface rounded-b-lg shadow-lg border-t border-border z-[1001]">
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
        </div>
    );
}
