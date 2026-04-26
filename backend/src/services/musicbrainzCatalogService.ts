import pool from '../config/database';

type MusicBrainzRemoteArtist = {
    id: string;
    name?: string;
    'sort-name'?: string;
    type?: string;
    country?: string;
    area?: { id?: string; name?: string };
    'begin-area'?: { id?: string; name?: string };
    'life-span'?: { begin?: string; end?: string; ended?: boolean };
    disambiguation?: string;
    aliases?: unknown[];
    genres?: unknown[];
    tags?: unknown[];
    relations?: Array<{
        type?: string;
        'target-type'?: string;
        url?: { resource?: string };
    }>;
};

type MusicBrainzRemoteRelation = NonNullable<MusicBrainzRemoteArtist['relations']>[number];

type CatalogArtistRow = {
    mbid: string;
    name: string;
    sort_name: string | null;
    type: string | null;
    country: string | null;
    area_name: string | null;
    area_mbid: string | null;
    begin_area_name: string | null;
    begin_area_mbid: string | null;
    life_span_begin: string | null;
    life_span_end: string | null;
    ended: boolean | null;
    disambiguation: string | null;
    alias_count: number;
    genre_count: number;
    tag_count: number;
    relation_count: number;
    website_url: string | null;
    wikidata_url: string | null;
    instagram_url: string | null;
    twitter_url: string | null;
    tiktok_url: string | null;
    youtube_url: string | null;
    spotify_url: string | null;
    apple_music_url: string | null;
    bandcamp_url: string | null;
    soundcloud_url: string | null;
    seed_sources: string[];
    popularity: unknown;
    global_rank: number | null;
    regional_ranks: unknown;
};

type CatalogLinkRow = {
    url: string;
    host: string | null;
    relation_type: string;
    category: string;
    is_primary: boolean;
};

const musicBrainzBaseUrl = 'https://musicbrainz.org/ws/2';
const musicBrainzUserAgent = process.env.MUSICBRAINZ_USER_AGENT || 'Achizu/0.1 (artist-location-map)';

function rowToArtist(row: CatalogArtistRow) {
    return {
        mbid: row.mbid,
        name: row.name,
        sortName: row.sort_name,
        type: row.type,
        country: row.country,
        areaName: row.area_name,
        areaMbid: row.area_mbid,
        beginAreaName: row.begin_area_name,
        beginAreaMbid: row.begin_area_mbid,
        lifeSpanBegin: row.life_span_begin,
        lifeSpanEnd: row.life_span_end,
        ended: row.ended,
        disambiguation: row.disambiguation,
        aliasCount: row.alias_count,
        genreCount: row.genre_count,
        tagCount: row.tag_count,
        relationCount: row.relation_count,
        websiteUrl: row.website_url,
        wikidataUrl: row.wikidata_url,
        instagramUrl: row.instagram_url,
        twitterUrl: row.twitter_url,
        tiktokUrl: row.tiktok_url,
        youtubeUrl: row.youtube_url,
        spotifyUrl: row.spotify_url,
        appleMusicUrl: row.apple_music_url,
        bandcampUrl: row.bandcamp_url,
        soundcloudUrl: row.soundcloud_url,
        seedSources: row.seed_sources || [],
        popularity: row.popularity,
        globalRank: row.global_rank,
        regionalRanks: row.regional_ranks || []
    };
}

function hostFor(url: string) {
    try {
        return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        return null;
    }
}

function hasHost(url: string, hosts: string[]) {
    const host = hostFor(url);
    return !!host && hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

function categoryFor(relationType: string, url: string) {
    const type = relationType.toLowerCase();

    if (type.includes('social') || hasHost(url, ['instagram.com', 'twitter.com', 'x.com', 'tiktok.com', 'facebook.com'])) {
        return 'social';
    }

    if (type.includes('stream') || hasHost(url, ['open.spotify.com', 'music.apple.com', 'soundcloud.com', 'youtube.com', 'youtu.be'])) {
        return 'streaming';
    }

    if (type.includes('purchase') || type.includes('download') || hasHost(url, ['bandcamp.com', 'mora.jp', 'ototoy.jp'])) {
        return 'purchase';
    }

    if (type.includes('homepage') || type === 'official homepage') {
        return 'official';
    }

    if (type.includes('wikidata') || hasHost(url, ['wikidata.org'])) {
        return 'database';
    }

    return 'external';
}

function firstUnique(values: string[]) {
    return [...new Set(values)].find(Boolean) || null;
}

function isUrlRelation(relation: MusicBrainzRemoteRelation) {
    return relation?.['target-type'] === 'url' && typeof relation.url?.resource === 'string';
}

function extractLinks(artist: MusicBrainzRemoteArtist) {
    const rows = new Map<string, { url: string; host: string | null; relationType: string; category: string; isPrimary: boolean }>();
    const buckets = {
        website: [] as string[],
        wikidata: [] as string[],
        instagram: [] as string[],
        twitter: [] as string[],
        tiktok: [] as string[],
        youtube: [] as string[],
        spotify: [] as string[],
        appleMusic: [] as string[],
        bandcamp: [] as string[],
        soundcloud: [] as string[],
    };

    const add = (url: string, relationType: string) => {
        const category = categoryFor(relationType, url);
        rows.set(url, {
            url,
            host: hostFor(url),
            relationType,
            category,
            isPrimary: false
        });

        if (relationType === 'official homepage') buckets.website.push(url);
        if (relationType === 'wikidata' || hasHost(url, ['wikidata.org'])) buckets.wikidata.push(url);
        if (hasHost(url, ['instagram.com'])) buckets.instagram.push(url);
        if (hasHost(url, ['twitter.com', 'x.com'])) buckets.twitter.push(url);
        if (hasHost(url, ['tiktok.com'])) buckets.tiktok.push(url);
        if (hasHost(url, ['youtube.com', 'youtu.be'])) buckets.youtube.push(url);
        if (hasHost(url, ['open.spotify.com'])) buckets.spotify.push(url);
        if (hasHost(url, ['music.apple.com'])) buckets.appleMusic.push(url);
        if (hasHost(url, ['bandcamp.com'])) buckets.bandcamp.push(url);
        if (hasHost(url, ['soundcloud.com'])) buckets.soundcloud.push(url);
    };

    for (const relation of artist.relations || []) {
        if (!isUrlRelation(relation)) continue;
        add(relation.url!.resource!, relation.type || 'url');
    }

    const primaryUrls = new Set([
        firstUnique(buckets.website),
        firstUnique(buckets.wikidata),
        firstUnique(buckets.instagram),
        firstUnique(buckets.twitter),
        firstUnique(buckets.tiktok),
        firstUnique(buckets.youtube),
        firstUnique(buckets.spotify),
        firstUnique(buckets.appleMusic),
        firstUnique(buckets.bandcamp),
        firstUnique(buckets.soundcloud),
    ].filter((value): value is string => !!value));

    for (const url of primaryUrls) {
        const row = rows.get(url);
        if (row) row.isPrimary = true;
    }

    return {
        websiteUrl: firstUnique(buckets.website),
        wikidataUrl: firstUnique(buckets.wikidata),
        instagramUrl: firstUnique(buckets.instagram),
        twitterUrl: firstUnique(buckets.twitter),
        tiktokUrl: firstUnique(buckets.tiktok),
        youtubeUrl: firstUnique(buckets.youtube),
        spotifyUrl: firstUnique(buckets.spotify),
        appleMusicUrl: firstUnique(buckets.appleMusic),
        bandcampUrl: firstUnique(buckets.bandcamp),
        soundcloudUrl: firstUnique(buckets.soundcloud),
        rows: [...rows.values()]
    };
}

async function fetchMusicBrainzJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
        headers: {
            'User-Agent': musicBrainzUserAgent,
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`MusicBrainz HTTP ${response.status}`);
    }

    return await response.json() as T;
}

async function upsertRemoteArtist(remoteArtist: MusicBrainzRemoteArtist) {
    const links = extractLinks(remoteArtist);
    const artistResult = await pool.query(`
        INSERT INTO public.musicbrainz_artists (
            mbid, name, sort_name, type, country, area_name, area_mbid,
            begin_area_name, begin_area_mbid, life_span_begin, life_span_end, ended,
            disambiguation, alias_count, genre_count, tag_count, relation_count,
            website_url, wikidata_url, instagram_url, twitter_url, tiktok_url,
            youtube_url, spotify_url, apple_music_url, bandcamp_url, soundcloud_url,
            seed_sources
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17,
            $18, $19, $20, $21, $22,
            $23, $24, $25, $26, $27,
            ARRAY['musicbrainz-api']
        )
        ON CONFLICT (mbid) DO UPDATE SET
            name = EXCLUDED.name,
            sort_name = EXCLUDED.sort_name,
            type = EXCLUDED.type,
            country = EXCLUDED.country,
            area_name = EXCLUDED.area_name,
            area_mbid = EXCLUDED.area_mbid,
            begin_area_name = EXCLUDED.begin_area_name,
            begin_area_mbid = EXCLUDED.begin_area_mbid,
            life_span_begin = EXCLUDED.life_span_begin,
            life_span_end = EXCLUDED.life_span_end,
            ended = EXCLUDED.ended,
            disambiguation = EXCLUDED.disambiguation,
            alias_count = EXCLUDED.alias_count,
            genre_count = EXCLUDED.genre_count,
            tag_count = EXCLUDED.tag_count,
            relation_count = EXCLUDED.relation_count,
            website_url = COALESCE(EXCLUDED.website_url, public.musicbrainz_artists.website_url),
            wikidata_url = COALESCE(EXCLUDED.wikidata_url, public.musicbrainz_artists.wikidata_url),
            instagram_url = COALESCE(EXCLUDED.instagram_url, public.musicbrainz_artists.instagram_url),
            twitter_url = COALESCE(EXCLUDED.twitter_url, public.musicbrainz_artists.twitter_url),
            tiktok_url = COALESCE(EXCLUDED.tiktok_url, public.musicbrainz_artists.tiktok_url),
            youtube_url = COALESCE(EXCLUDED.youtube_url, public.musicbrainz_artists.youtube_url),
            spotify_url = COALESCE(EXCLUDED.spotify_url, public.musicbrainz_artists.spotify_url),
            apple_music_url = COALESCE(EXCLUDED.apple_music_url, public.musicbrainz_artists.apple_music_url),
            bandcamp_url = COALESCE(EXCLUDED.bandcamp_url, public.musicbrainz_artists.bandcamp_url),
            soundcloud_url = COALESCE(EXCLUDED.soundcloud_url, public.musicbrainz_artists.soundcloud_url),
            seed_sources = (
                SELECT ARRAY(SELECT DISTINCT unnest(public.musicbrainz_artists.seed_sources || EXCLUDED.seed_sources))
            )
        RETURNING *
    `, [
        remoteArtist.id,
        remoteArtist.name || '',
        remoteArtist['sort-name'] || null,
        remoteArtist.type || null,
        remoteArtist.country || null,
        remoteArtist.area?.name || null,
        remoteArtist.area?.id || null,
        remoteArtist['begin-area']?.name || null,
        remoteArtist['begin-area']?.id || null,
        remoteArtist['life-span']?.begin || null,
        remoteArtist['life-span']?.end || null,
        remoteArtist['life-span']?.ended ?? null,
        remoteArtist.disambiguation || null,
        Array.isArray(remoteArtist.aliases) ? remoteArtist.aliases.length : 0,
        Array.isArray(remoteArtist.genres) ? remoteArtist.genres.length : 0,
        Array.isArray(remoteArtist.tags) ? remoteArtist.tags.length : 0,
        Array.isArray(remoteArtist.relations) ? remoteArtist.relations.length : 0,
        links.websiteUrl,
        links.wikidataUrl,
        links.instagramUrl,
        links.twitterUrl,
        links.tiktokUrl,
        links.youtubeUrl,
        links.spotifyUrl,
        links.appleMusicUrl,
        links.bandcampUrl,
        links.soundcloudUrl,
    ]);

    for (const link of links.rows) {
        await pool.query(`
            INSERT INTO public.musicbrainz_artist_links (artist_mbid, url, host, relation_type, category, is_primary)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (artist_mbid, url) DO UPDATE SET
                host = EXCLUDED.host,
                relation_type = EXCLUDED.relation_type,
                category = EXCLUDED.category,
                is_primary = public.musicbrainz_artist_links.is_primary OR EXCLUDED.is_primary
        `, [remoteArtist.id, link.url, link.host, link.relationType, link.category, link.isPrimary]);
    }

    return rowToArtist(artistResult.rows[0]);
}

export const MusicBrainzCatalogService = {
    search: async (options: { q: string; country?: string; type?: string; limit?: number }) => {
        const q = options.q.trim();
        const limit = Math.min(options.limit || 20, 100);
        const values: unknown[] = [q, `%${q}%`];
        const where = ['(name ILIKE $2 OR sort_name ILIKE $2)'];
        let paramIndex = 3;

        if (options.country?.trim()) {
            where.push(`country = $${paramIndex++}`);
            values.push(options.country.trim().toUpperCase());
        }

        if (options.type?.trim()) {
            where.push(`LOWER(type) = LOWER($${paramIndex++})`);
            values.push(options.type.trim());
        }

        values.push(limit);
        const result = await pool.query(`
            SELECT *
            FROM public.musicbrainz_artists
            WHERE ${where.join(' AND ')}
            ORDER BY
                CASE WHEN LOWER(name) = LOWER($1) THEN 0 ELSE 1 END,
                global_rank NULLS LAST,
                relation_count DESC,
                name ASC
            LIMIT $${paramIndex}
        `, values);

        return result.rows.map(rowToArtist);
    },

    getByMbid: async (mbid: string) => {
        const artistResult = await pool.query('SELECT * FROM public.musicbrainz_artists WHERE mbid = $1', [mbid]);
        if (artistResult.rows.length === 0) return null;

        const linksResult = await pool.query(`
            SELECT url, host, relation_type, category, is_primary
            FROM public.musicbrainz_artist_links
            WHERE artist_mbid = $1
            ORDER BY is_primary DESC, category ASC, relation_type ASC, url ASC
        `, [mbid]);

        return {
            ...rowToArtist(artistResult.rows[0]),
            links: linksResult.rows.map((row: CatalogLinkRow) => ({
                url: row.url,
                host: row.host,
                relationType: row.relation_type,
                category: row.category,
                isPrimary: row.is_primary
            }))
        };
    },

    fetchAndCacheByMbid: async (mbid: string) => {
        const url = `${musicBrainzBaseUrl}/artist/${encodeURIComponent(mbid)}?fmt=json&inc=url-rels+aliases+tags+genres`;
        const remoteArtist = await fetchMusicBrainzJson<MusicBrainzRemoteArtist>(url);
        return await upsertRemoteArtist(remoteArtist);
    },

    searchRemoteAndCacheFirst: async (query: string) => {
        const params = new URLSearchParams({
            fmt: 'json',
            query,
            limit: '1'
        });
        const response = await fetchMusicBrainzJson<{ artists?: MusicBrainzRemoteArtist[] }>(`${musicBrainzBaseUrl}/artist?${params.toString()}`);
        const remoteArtist = response.artists?.[0];
        if (!remoteArtist?.id) return null;
        return await MusicBrainzCatalogService.fetchAndCacheByMbid(remoteArtist.id);
    }
};
