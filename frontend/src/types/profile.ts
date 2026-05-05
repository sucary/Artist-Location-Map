export interface Profile {
    id: string;
    email: string;
    username: string | null;
    isAdmin: boolean;
    isApproved: boolean;
    isPrivate: boolean;
    locationLanguage: string;
    tutorialCompleted: boolean;
    isRejected: boolean;
}

export interface PendingUser {
    id: string;
    email: string;
    username: string | null;
    createdAt: string;
}
