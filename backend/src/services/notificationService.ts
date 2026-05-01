import pool from '../config/database';
import { NotificationStore, type NotificationInput, type Notification } from '../models/notificationStore';

type NotificationServiceInput = Omit<NotificationInput, 'userId'>;

export const NotificationService = {
    createForUser: async (userId: string | null | undefined, input: NotificationServiceInput): Promise<Notification | null> => {
        if (!userId) return null;
        return NotificationStore.create({ ...input, userId });
    },

    createForUsers: async (userIds: Array<string | null | undefined>, input: NotificationServiceInput): Promise<void> => {
        const uniqueUserIds = [...new Set(userIds.filter((userId): userId is string => Boolean(userId)))];
        await Promise.all(uniqueUserIds.map((userId) => NotificationStore.create({ ...input, userId })));
    },

    createForAdmins: async (input: NotificationServiceInput): Promise<void> => {
        const result = await pool.query<{ id: string }>(
            `SELECT id FROM profiles WHERE is_admin = TRUE`
        );
        await NotificationService.createForUsers(result.rows.map((row) => row.id), input);
    },

    notifyArtistChanged: async (input: {
        artistId: string;
        artistName: string;
        changedByUserId: string;
        affectedUserIds: string[];
        linkUrl?: string;
    }): Promise<void> => {
        // Keep caller logic stable while artist ownership rules may change.
        const affectedUserIds = input.affectedUserIds.filter((userId) => userId !== input.changedByUserId);
        await NotificationService.createForUsers(affectedUserIds, {
            type: 'artist_changed',
            title: 'Artist updated',
            content: `${input.artistName} was changed by another user.`,
            linkLabel: 'View artist',
            linkUrl: input.linkUrl,
            aggregationKey: `artist_changed:${input.artistId}`,
            metadata: {
                artistId: input.artistId,
                changedByUserId: input.changedByUserId
            }
        });
    }
};
