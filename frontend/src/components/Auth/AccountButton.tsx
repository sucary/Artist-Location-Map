import { useAuth } from '../../context/AuthContext';
import { AuthModal } from './AuthModal';
import { UserMenu } from './UserMenu';
import { useTranslation } from 'react-i18next';

interface AccountButtonProps {
    showAuthModal: boolean;
    onOpenAuthModal: () => void;
    onCloseAuthModal: () => void;
    onOpenAdminDashboard?: () => void;
}

export function AccountButton({ showAuthModal, onOpenAuthModal, onCloseAuthModal, onOpenAdminDashboard }: AccountButtonProps) {
    const { user, loading } = useAuth();
    const { t } = useTranslation();

    if (loading) {
        return null;
    }

    return (
        <>
            {user ? (
                <UserMenu onOpenAdminDashboard={onOpenAdminDashboard} />
            ) : (
                <button
                    onClick={onOpenAuthModal}
                    className="bg-surface px-4 py-2 rounded-md shadow-md hover:bg-surface-muted focus:bg-surface-muted active:bg-surface-muted transition-colors text-text text-sm font-medium"
                >
                    {t('auth.buttons.signIn')}
                </button>
            )}
            <AuthModal isOpen={showAuthModal} onClose={onCloseAuthModal} />
        </>
    );
}
