import pool from '../config/database';
import { NominatimSearchResult } from '../types/city';

const CACHE_DURATION_DAYS = 14;

export const SearchCacheService = {
    /**
     * Normalize keyword for consistent cache lookups
     * - lowercase
     * - trim whitespace
     * - collapse multiple spaces
     */
    normalizeKeyword(query: string, lang?: string): string {
        const base = query.trim().toLowerCase().replace(/\s+/g, ' ');
        return lang ? `${base}:${lang}` : base;
    },

    /**
     * Get cached search results for a keyword
     * Returns null if not found or expired
     */
    async get<T = NominatimSearchResult>(query: string, lang?: string): Promise<T[] | null> {
        const keyword = this.normalizeKeyword(query, lang);

        try {
            // Update hit_count and return results in one query
            const result = await pool.query(`
                UPDATE search_cache
                SET hit_count = hit_count + 1
                WHERE keyword = $1 AND expires_at > NOW()
                RETURNING results
            `, [keyword]);

            if (result.rows.length === 0) return null;
            return result.rows[0].results as T[];
        } catch (error) {
            console.error('Error fetching from search cache:', error);
            return null;
        }
    },

    /**
     * Check if a keyword is cached (without incrementing hit count)
     */
    async has(query: string): Promise<boolean> {
        return (await this.getResultCount(query)) !== null;
    },

    /**
     * Get cached result count (null if not cached)
     */
    async getResultCount(query: string, lang?: string): Promise<number | null> {
        const keyword = this.normalizeKeyword(query, lang);

        try {
            const result = await pool.query(`
                SELECT result_count FROM search_cache
                WHERE keyword = $1 AND expires_at > NOW()
            `, [keyword]);

            return result.rows.length > 0 ? result.rows[0].result_count : null;
        } catch (error) {
            console.error('Error getting cache count:', error);
            return null;
        }
    },

    /**
     * Cache search results for a keyword
     */
    async set<T = NominatimSearchResult>(query: string, results: T[], lang?: string): Promise<void> {
        const keyword = this.normalizeKeyword(query, lang);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + CACHE_DURATION_DAYS);

        try {
            await pool.query(`
                INSERT INTO search_cache (keyword, results, result_count, expires_at)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (keyword) DO UPDATE SET
                    results = EXCLUDED.results,
                    result_count = EXCLUDED.result_count,
                    expires_at = EXCLUDED.expires_at
            `, [keyword, JSON.stringify(results), results.length, expiresAt]);
        } catch (error) {
            console.error('Error saving to search cache:', error);
            // Don't throw - caching failure shouldn't break the search
        }
    },
};
