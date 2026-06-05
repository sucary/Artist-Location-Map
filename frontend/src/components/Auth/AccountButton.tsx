import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AuthModal } from './AuthModal';
import { UserMenu } from './UserMenu';
import { useTranslation } from 'react-i18next';

interface AccountButtonProps {
    showAuthModal: boolean;
    onOpenAuthModal: () => void;
    onCloseAuthModal: () => void;
    onOpenAdminDashboard?: () => void;
    onMenuOpenChange?: (open: boolean) => void;
}

export function AccountButton({ showAuthModal, onOpenAuthModal, onCloseAuthModal, onOpenAdminDashboard, onMenuOpenChange }: AccountButtonProps) {
    const { user, profile, loading } = useAuth();
    const { t } = useTranslation();

    useEffect(() => {
        if (!loading && user && profile) return;

        // Anonymous auth states cannot leave a stale user-menu map lock behind
        onMenuOpenChange?.(false);
    }, [loading, onMenuOpenChange, profile, user]);

    if (loading) {
        return null;
    }

    return (
        <>
            {user && profile ? (
                <UserMenu onOpenAdminDashboard={onOpenAdminDashboard} onOpenChange={onMenuOpenChange} />
            ) : (
                <button
                    onClick={onOpenAuthModal}
                    className="bg-surface px-4 py-2 rounded-md shadow-md hover:bg-surface-muted active:bg-surface-muted transition-colors text-text text-sm font-medium"
                >
                    {t('auth.buttons.signIn')}
                </button>
            )}
            <AuthModal isOpen={showAuthModal} onClose={onCloseAuthModal} />
        </>
    );
}
