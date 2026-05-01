import pool from '../config/database';

export interface Profile {
  id: string;
  email: string;
  username: string | null;
  isAdmin: boolean;
  isApproved: boolean;
  isPrivate: boolean;
  locationLanguage: string;
  isRejected: boolean;
}

export interface PendingUser {
    id: string;
    email: string;
    username: string | null;
    createdAt: Date;
}

async function ensureRejectedRegistrationsTable(): Promise<void> {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS rejected_registrations (
            email TEXT PRIMARY KEY,
            rejected_user_id UUID,
            rejected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

export const ProfileStore = {
    getByUserId: async (userId: string): Promise<Profile | null> => {
        const result = await pool.query<Omit<Profile, 'isRejected'>>(
            `SELECT
                p.id,
                p.email,
                p.username,
                p.is_admin as "isAdmin",
                p.is_approved as "isApproved",
                p.is_private as "isPrivate",
                p.location_language as "locationLanguage"
              FROM profiles p
              WHERE p.id = $1`,
            [userId]
        );
        const profile = result.rows[0];
        if (!profile) return null;

        // Avoid querying rejected_registrations before migration 012 exists.
        const rejectedTableResult = await pool.query<{ exists: boolean }>(
            `SELECT to_regclass('public.rejected_registrations') IS NOT NULL as "exists"`
        );

        if (!rejectedTableResult.rows[0]?.exists) {
            return { ...profile, isRejected: false };
        }

        const rejectedResult = await pool.query<{ isRejected: boolean }>(
            `SELECT EXISTS (
                SELECT 1
                FROM rejected_registrations
                WHERE lower(email) = lower($1)
            ) as "isRejected"`,
            [profile.email]
        );

        return {
            ...profile,
            isRejected: rejectedResult.rows[0]?.isRejected ?? false
        };
    },

    updateProfile: async (userId: string, updates: { username?: string; isPrivate?: boolean; locationLanguage?: string }): Promise<void> => {
        const setClauses: string[] = [];
        const values: (string | boolean)[] = [];
        let paramIndex = 1;

        if (updates.username !== undefined) {
            setClauses.push(`username = $${paramIndex++}`);
            values.push(updates.username);
        }
        if (updates.isPrivate !== undefined) {
            setClauses.push(`is_private = $${paramIndex++}`);
            values.push(updates.isPrivate);
        }
        if (updates.locationLanguage !== undefined) {
            setClauses.push(`location_language = $${paramIndex++}`);
            values.push(updates.locationLanguage);
        }

        if (setClauses.length === 0) return;

        values.push(userId);
        await pool.query(
            `UPDATE profiles SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
            values
        );
    },

    checkUsernameAvailable: async (username: string): Promise<boolean> => {
        const result = await pool.query(
            `SELECT 1 FROM profiles WHERE username = $1`,
            [username]
        );
        return result.rows.length === 0;
    },

    checkEmailAvailable: async (email: string): Promise<boolean> => {
        const result = await pool.query(
            `SELECT 1 FROM profiles WHERE email = $1`,
            [email]
        );
        return result.rows.length === 0;
    },

    getPendingUsers: async (): Promise<PendingUser[]> => {
        const result = await pool.query(
            `SELECT id, email, username, created_at as "createdAt"
             FROM profiles
             WHERE is_approved = false
             ORDER BY created_at DESC`
        );
        return result.rows;
    },

    approveUser: async (userId: string): Promise<void> => {
        await pool.query(
            `UPDATE profiles SET is_approved = true WHERE id = $1`,
            [userId]
        );
    },

    rejectUser: async (userId: string): Promise<void> => {
        const profileResult = await pool.query<{ email: string | null }>(
            `SELECT email FROM profiles WHERE id = $1`,
            [userId]
        );
        const email = profileResult.rows[0]?.email;

        if (email) {
            await ensureRejectedRegistrationsTable();
            // Profile is deleted by cascade after auth user deletion.
            await pool.query(
                `INSERT INTO rejected_registrations (email, rejected_user_id)
                 VALUES (lower($1), $2)
                 ON CONFLICT (email) DO UPDATE SET
                    rejected_user_id = EXCLUDED.rejected_user_id,
                    rejected_at = NOW()`,
                [email, userId]
            );
        }

        // Delete user from auth.users (cascade will delete profile)
        await pool.query(
            `DELETE FROM auth.users WHERE id = $1`,
            [userId]
        );
    },
};
