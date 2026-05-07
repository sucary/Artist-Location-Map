import { useNavigate } from 'react-router-dom';
import { Button } from './ui';

interface UserNotFoundProps {
    username: string;
}

export function UserNotFound({ username }: UserNotFoundProps) {
    const navigate = useNavigate();

    const handleGoBack = () => {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate('/');
        }
    };

    return (
        <div className="h-screen w-screen flex items-center justify-center bg-surface-secondary">
            <div className="max-w-sm px-6">
                <h1 className="text-xl font-medium text-text mb-4">
                    Can't find {username} ;_;
                </h1>
                <p className="text-sm text-text-muted mb-2">This could be because:</p>
                <ul className="text-sm text-text-muted mb-6 list-disc list-inside space-y-1">
                    <li>The user doesn't exist</li>
                    <li>The profile is private</li>
                    <li>The account has been deleted</li>
                </ul>
                <Button onClick={handleGoBack} variant="primary">
                    Go Back
                </Button>
            </div>
        </div>
    );
}
