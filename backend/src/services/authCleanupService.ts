import pool from '../config/database';

// Signup confirmation cleanup window
const SIGNUP_CONFIRMATION_EXPIRY_MS = 15 * 60 * 1000;

export interface AuthCleanupResult {
    deletedCount: number;
}

async function hasSupabaseAuthUsersTable(): Promise<boolean> {
    const result = await pool.query<{ exists: boolean }>(
        `SELECT to_regclass('auth.users') IS NOT NULL as "exists"`
    );
    return result.rows[0]?.exists ?? false;
}

export const AuthCleanupService = {
    cleanupExpiredSignupConfirmations: async (
        expiryMs = SIGNUP_CONFIRMATION_EXPIRY_MS
    ): Promise<AuthCleanupResult> => {
        const hasAuthUsersTable = await hasSupabaseAuthUsersTable();
        if (!hasAuthUsersTable) return { deletedCount: 0 };

        // Remove never-confirmed signup users after the confirmation email window
        const result = await pool.query<{ id: string }>(
            `DELETE FROM auth.users
             WHERE email IS NOT NULL
               AND email_confirmed_at IS NULL
               AND COALESCE(confirmation_sent_at, created_at) < NOW() - ($1::int * INTERVAL '1 millisecond')
             RETURNING id`,
            [expiryMs]
        );

        return { deletedCount: result.rowCount ?? 0 };
    },
};
