import pool from '../config/database';

export interface Profile {
  id: string;
  email: string;
  username: string | null;
  isAdmin: boolean;
  isApproved: boolean;
  isPrivate: boolean;
  locationLanguage: string;
  uiLanguage: string;
  artistNameDisplayMode: string;
  tutorialCompleted: boolean;
  isRejected: boolean;
}

export interface PendingUser {
    id: string;
    email: string;
    username: string | null;
    createdAt: Date;
}

export interface NotificationRecipient {
    id: string;
    email: string;
    username: string | null;
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

async function ensureAddArtistTutorialColumn(): Promise<void> {
    await pool.query(`
        ALTER TABLE profiles
        ADD COLUMN IF NOT EXISTS tutorial_completed BOOLEAN NOT NULL DEFAULT FALSE
    `);
}

async function ensureArtistNameDisplayModeColumn(): Promise<void> {
    await pool.query(`
        ALTER TABLE profiles
        ADD COLUMN IF NOT EXISTS artist_name_display_mode TEXT NOT NULL DEFAULT 'both'
    `);
}

async function ensureUiLanguageColumn(): Promise<void> {
    await pool.query(`
        ALTER TABLE profiles
        ADD COLUMN IF NOT EXISTS ui_language TEXT NOT NULL DEFAULT 'en'
    `);
}

export const ProfileStore = {
    getByUserId: async (userId: string): Promise<Profile | null> => {
        await ensureAddArtistTutorialColumn();
        await ensureArtistNameDisplayModeColumn();
        await ensureUiLanguageColumn();

        const result = await pool.query<Omit<Profile, 'isRejected'>>(
            `SELECT
                p.id,
                p.email,
                p.username,
                p.is_admin as "isAdmin",
                p.is_approved as "isApproved",
                p.is_private as "isPrivate",
                p.location_language as "locationLanguage",
                COALESCE(p.ui_language, 'en') as "uiLanguage",
                COALESCE(p.artist_name_display_mode, 'both') as "artistNameDisplayMode",
                COALESCE(p.tutorial_completed, false) as "tutorialCompleted"
              FROM profiles p
              WHERE p.id = $1`,
            [userId]
        );
        const profile = result.rows[0];
        if (!profile) return null;

        // Registration no longer requires approval; report everyone as approved.
        profile.isApproved = true;

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

    createProfile: async (userId: string, email: string): Promise<Profile> => {
        await pool.query(
            `INSERT INTO profiles (id, email)
             VALUES ($1, $2)
             ON CONFLICT (id) DO NOTHING`,
            [userId, email]
        );
        // Fetch to get defaults and apply isApproved/nameDisplayMode overrides
        const profile = await ProfileStore.getByUserId(userId);
        if (!profile) {
            throw new Error('Failed to create profile');
        }
        return profile;
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

    updateProfile: async (userId: string, updates: { username?: string; isPrivate?: boolean; locationLanguage?: string; uiLanguage?: string; artistNameDisplayMode?: string; tutorialCompleted?: boolean }): Promise<void> => {
        if (updates.tutorialCompleted !== undefined) {
            await ensureAddArtistTutorialColumn();
        }
        if (updates.artistNameDisplayMode !== undefined) {
            await ensureArtistNameDisplayModeColumn();
        }
        if (updates.uiLanguage !== undefined) {
            await ensureUiLanguageColumn();
        }

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
        if (updates.uiLanguage !== undefined) {
            setClauses.push(`ui_language = $${paramIndex++}`);
            values.push(updates.uiLanguage);
        }
        if (updates.artistNameDisplayMode !== undefined) {
            setClauses.push(`artist_name_display_mode = $${paramIndex++}`);
            values.push(updates.artistNameDisplayMode);
        }
        if (updates.tutorialCompleted !== undefined) {
            setClauses.push(`tutorial_completed = $${paramIndex++}`);
            values.push(updates.tutorialCompleted);
        }

        if (setClauses.length === 0) return;

        values.push(userId);
        await pool.query(
            `UPDATE profiles SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
            values
        );
    },

    checkUsernameAvailable: async (username: string): Promise<boolean> => {
        const normalizedUsername = username.trim().toLowerCase();
        const result = await pool.query(
            `SELECT 1 FROM profiles WHERE lower(username) = $1`,
            [normalizedUsername]
        );
        return result.rows.length === 0;
    },

    checkEmailAvailable: async (email: string): Promise<boolean> => {
        const normalizedEmail = email.trim().toLowerCase();
        const result = await pool.query(
            `SELECT 1 FROM profiles WHERE lower(email) = $1`,
            [normalizedEmail]
        );
        return result.rows.length === 0;
    },

    emailHasPasswordIdentity: async (email: string): Promise<boolean> => {
        const normalizedEmail = email.trim().toLowerCase();

        const identitiesTableResult = await pool.query<{ exists: boolean }>(
            `SELECT to_regclass('auth.identities') IS NOT NULL as "exists"`
        );

        if (!identitiesTableResult.rows[0]?.exists) {
            return !(await ProfileStore.checkEmailAvailable(normalizedEmail));
        }

        const result = await pool.query(
            `SELECT 1
             FROM auth.identities
             WHERE provider = 'email'
               AND (
                    lower(email) = $1
                    OR user_id IN (
                        SELECT id FROM auth.users WHERE lower(email) = $1
                    )
               )
             LIMIT 1`,
            [normalizedEmail]
        );
        return result.rows.length > 0;
    },

    getAllNotificationRecipientIds: async (): Promise<string[]> => {
        const result = await pool.query<{ id: string }>(
            `SELECT id
             FROM profiles
             ORDER BY created_at DESC`
        );
        return result.rows.map((row) => row.id);
    },

    searchNotificationRecipients: async (query: string): Promise<NotificationRecipient[]> => {
        const normalizedQuery = query.trim().toLowerCase();
        if (normalizedQuery.length < 2) return [];

        const result = await pool.query<NotificationRecipient>(
            `SELECT id, email, username
             FROM profiles
             WHERE lower(email) LIKE $1
                OR lower(COALESCE(username, '')) LIKE $1
             ORDER BY
                CASE
                    WHEN lower(COALESCE(username, '')) = $2 THEN 0
                    WHEN lower(email) = $2 THEN 1
                    ELSE 2
                END,
                username NULLS LAST,
                email
             LIMIT 10`,
            [`%${normalizedQuery}%`, normalizedQuery]
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
