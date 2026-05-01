import pool from '../config/database';

export interface Notification {
    id: string;
    userId: string;
    type: string;
    title: string;
    content: string;
    isRead: boolean;
    isHard: boolean;
    linkLabel: string | null;
    linkUrl: string | null;
    metadata: Record<string, unknown>;
    aggregationKey: string | null;
    createdAt: Date;
    readAt: Date | null;
}

export interface NotificationInput {
    userId: string;
    type: string;
    title: string;
    content: string;
    isHard?: boolean;
    linkLabel?: string | null;
    linkUrl?: string | null;
    metadata?: Record<string, unknown>;
    aggregationKey?: string | null;
}

const notificationSelect = `
    id,
    user_id as "userId",
    type,
    title,
    content,
    is_read as "isRead",
    is_hard as "isHard",
    link_label as "linkLabel",
    link_url as "linkUrl",
    metadata,
    aggregation_key as "aggregationKey",
    created_at as "createdAt",
    read_at as "readAt"
`;

export const NotificationStore = {
    listForUser: async (userId: string): Promise<Notification[]> => {
        const result = await pool.query<Notification>(
            `SELECT ${notificationSelect}
             FROM notifications
             WHERE user_id = $1
             ORDER BY is_hard DESC, is_read ASC, created_at DESC`,
            [userId]
        );
        return result.rows;
    },

    create: async (input: NotificationInput): Promise<Notification> => {
        const metadata = input.metadata ?? {};
        const result = await pool.query<Notification>(
            `INSERT INTO notifications (
                user_id, type, title, content, is_hard, link_label, link_url, metadata, aggregation_key
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9
             )
             -- Refresh aggregated notifications instead of inserting duplicates.
             ON CONFLICT (user_id, aggregation_key) WHERE aggregation_key IS NOT NULL
             DO UPDATE SET
                type = EXCLUDED.type,
                title = EXCLUDED.title,
                content = EXCLUDED.content,
                is_read = FALSE,
                is_hard = EXCLUDED.is_hard,
                link_label = EXCLUDED.link_label,
                link_url = EXCLUDED.link_url,
                metadata = notifications.metadata || EXCLUDED.metadata,
                created_at = NOW(),
                read_at = NULL
             RETURNING ${notificationSelect}`,
            [
                input.userId,
                input.type,
                input.title,
                input.content,
                input.isHard ?? false,
                input.linkLabel ?? null,
                input.linkUrl ?? null,
                JSON.stringify(metadata),
                input.aggregationKey ?? null
            ]
        );
        return result.rows[0];
    },

    markRead: async (userId: string, ids: string[]): Promise<number> => {
        if (ids.length === 0) return 0;

        const result = await pool.query(
            `UPDATE notifications
             SET is_read = TRUE,
                 read_at = COALESCE(read_at, NOW())
             WHERE user_id = $1
               AND id = ANY($2::uuid[])
               AND is_read = FALSE`,
            [userId, ids]
        );
        return result.rowCount ?? 0;
    },

    deleteForUser: async (userId: string, notificationId: string): Promise<'deleted' | 'hard' | 'missing'> => {
        const existing = await pool.query<{ is_hard: boolean }>(
            `SELECT is_hard FROM notifications WHERE user_id = $1 AND id = $2`,
            [userId, notificationId]
        );

        const notification = existing.rows[0];
        if (!notification) return 'missing';
        // Hard notifications are not user-removable.
        if (notification.is_hard) return 'hard';

        await pool.query(
            `DELETE FROM notifications WHERE user_id = $1 AND id = $2`,
            [userId, notificationId]
        );
        return 'deleted';
    },

    clearCloseableForUser: async (userId: string): Promise<{ deleted: number; keptHard: number }> => {
        const keptHardResult = await pool.query<{ count: string }>(
            `SELECT COUNT(*)::text as count
             FROM notifications
             WHERE user_id = $1
               AND is_hard = TRUE`,
            [userId]
        );

        const deleteResult = await pool.query(
            `DELETE FROM notifications
             WHERE user_id = $1
               -- Keep hard notifications during clear-all.
               AND is_hard = FALSE`,
            [userId]
        );

        return {
            deleted: deleteResult.rowCount ?? 0,
            keptHard: Number(keptHardResult.rows[0]?.count ?? 0)
        };
    }
};
