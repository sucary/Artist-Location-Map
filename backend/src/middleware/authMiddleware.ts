import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import pool from '../config/database';

export interface AuthUser {
    id: string;
    email: string;
}

export interface AuthProfile {
    isAdmin: boolean;
    isApproved: boolean;
}

export interface AuthenticatedRequest extends Request {
    user?: AuthUser;
    profile?: AuthProfile;
}

async function fetchProfile(userId: string): Promise<AuthProfile> {
    const result = await pool.query(
        `SELECT is_admin, is_approved FROM profiles WHERE id = $1`,
        [userId]
    );
    const row = result.rows[0];
    return {
        isAdmin: row?.is_admin ?? false,
        isApproved: row?.is_approved ?? false
    };
}

/**
 * Middleware that requires authentication
 * Rejects request if no valid token provided
 */
export async function requireAuth(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid authorization header' });
        return;
    }

    const token = authHeader.substring(7);

    try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            res.status(401).json({ error: 'Invalid or expired token' });
            return;
        }

        req.user = {
            id: user.id,
            email: user.email || ''
        };

        req.profile = await fetchProfile(user.id);

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
}

/**
 * Middleware that optionally attaches user if token provided
 * Continues even without authentication
 */
export async function optionalAuth(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }

    const token = authHeader.substring(7);

    try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (!error && user) {
            req.user = {
                id: user.id,
                email: user.email || ''
            };

            req.profile = await fetchProfile(user.id);
        }
    } catch {
        // continue
    }

    next();
}

/**
 * Middleware that requires user to be approved for privileged actions.
 * New registrations are approved by default, but this preserves the gate for
 * manual moderation and future policy changes.
 */
export async function requireApproval(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) {
    if (!req.profile?.isApproved) {
        res.status(403).json({
            error: 'Account pending approval',
            message: 'Your account is awaiting admin approval. You will be notified once approved.'
        });
        return;
    }

    next();
}

/**
 * Middleware that requires user to be admin
 * Use after requireAuth
 */
export async function requireAdmin(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) {
    if (!req.profile?.isAdmin) {
        res.status(403).json({
            error: 'Admin access required',
            message: 'You do not have permission to access this resource.'
        });
        return;
    }

    next();
}
