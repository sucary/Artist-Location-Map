import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import pool from '../config/database';

type PopularityRecord = {
    source?: string;
    globalRank?: number;
    regionalRanks?: Array<Record<string, unknown>>;
};

type SeedArtist = {
    mbid?: string;
    name?: string;
    sortName?: string | null;
    type?: string | null;
    country?: string | null;
    areaName?: string | null;
    areaMbid?: string | null;
    beginAreaName?: string | null;
    beginAreaMbid?: string | null;
    lifeSpanBegin?: string | null;
    lifeSpanEnd?: string | null;
    ended?: boolean | null;
    disambiguation?: string | null;
    aliases?: Array<{
        name?: string;
        sortName?: string | null;
        'sort-name'?: string | null;
        locale?: string | null;
        type?: string | null;
        primary?: boolean | null;
        ended?: boolean | null;
        begin?: string | null;
        end?: string | null;
    }>;
    aliasNames?: string[];
    aliasCount?: number;
    genreCount?: number;
    tagCount?: number;
    relationCount?: number;
    websiteUrl?: string | null;
    wikidataUrl?: string | null;
    instagramUrl?: string | null;
    twitterUrl?: string | null;
    tiktokUrl?: string | null;
    youtubeUrl?: string | null;
    spotifyUrl?: string | null;
    appleMusicUrl?: string | null;
    bandcampUrl?: string | null;
    soundcloudUrl?: string | null;
    streamingLinks?: string[];
    purchaseLinks?: string[];
    socialLinks?: string[];
    externalLinks?: Array<{ type?: string; url?: string }>;
    seedSources?: string[];
    popularity?: PopularityRecord;
};

type CatalogAlias = {
    name: string;
    sortName: string | null;
    locale: string | null;
    type: string | null;
    primary: boolean | null;
    ended: boolean | null;
    begin: string | null;
    end: string | null;
};

type ArtistRow = {
    mbid: string;
    name: string;
    sortName: string | null;
    type: string | null;
    country: string | null;
    areaName: string | null;
    areaMbid: string | null;
    beginAreaName: string | null;
    beginAreaMbid: string | null;
    lifeSpanBegin: string | null;
    lifeSpanEnd: string | null;
    ended: boolean | null;
    disambiguation: string | null;
    aliases: CatalogAlias[];
    aliasNames: string[];
    aliasSearchText: string;
    aliasCount: number;
    genreCount: number;
    tagCount: number;
    relationCount: number;
    websiteUrl: string | null;
    wikidataUrl: string | null;
    instagramUrl: string | null;
    twitterUrl: string | null;
    tiktokUrl: string | null;
    youtubeUrl: string | null;
    spotifyUrl: string | null;
    appleMusicUrl: string | null;
    bandcampUrl: string | null;
    soundcloudUrl: string | null;
    seedSources: string[];
    popularity: PopularityRecord | null;
    globalRank: number | null;
    regionalRanks: Array<Record<string, unknown>>;
};

type LinkRow = {
    artistMbid: string;
    url: string;
    host: string | null;
    relationType: string;
    category: string;
    isPrimary: boolean;
};

const defaultInputPath = path.resolve(__dirname, '../../data/lastfm-seed.jsonl');
const migrationPath = path.resolve(__dirname, '../db/migrations/003_create_musicbrainz_catalog.sql');
const searchIndexesMigrationPath = path.resolve(__dirname, '../db/migrations/004_create_musicbrainz_search_indexes.sql');
const artistLinkMigrationPath = path.resolve(__dirname, '../db/migrations/005_add_musicbrainz_mbid_to_artists.sql');

function getArgValue(args: string[], name: string): string | undefined {
    const prefix = `${name}=`;
    const inline = args.find((arg) => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);

    const index = args.indexOf(name);
    if (index >= 0) return args[index + 1];

    return undefined;
}

function hasFlag(args: string[], name: string): boolean {
    return args.includes(name);
}

function toNumber(value: string | undefined, fallback: number) {
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function printHelp() {
    console.log(`
Import the MusicBrainz/Last.fm JSONL seed into Postgres/Supabase catalog tables.

Usage:
  npm run mb:import-seed -- [options]

Options:
  --input <path>       JSONL seed path. Default: data/lastfm-seed.jsonl
  --batch-size <n>    Artist upsert batch size. Default: 500
  --limit <n>         Stop after n valid seed artists
  --migrate           Run catalog/link migrations before importing
  --migrate-only      Run catalog/link migrations and exit
  --create-indexes    Run optional search-index migration 004 and exit
  --status            Print current catalog row counts and exit
  --dry-run           Parse and count rows without writing to the database
  --skip-links        Import artists only
  --link-batch-size <n> Link upsert batch size. Default: 1000
  --statement-timeout-ms <n> Per-statement timeout for real imports. Default: 60000
  --help              Show this message

Examples:
  npm run mb:import-seed -- --dry-run
  npm run mb:import-seed -- --migrate-only
  npm run mb:import-seed -- --batch-size 100 --link-batch-size 500
  npm run mb:import-seed -- --create-indexes
`);
}

function nullableUuid(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed || null;
}

function nullableText(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed || null;
}

function uniqueTexts(values: Array<string | null | undefined>) {
    return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value))];
}

function getAliases(record: SeedArtist): CatalogAlias[] {
    return (record.aliases || [])
        .map((alias) => {
            const name = alias.name?.trim();
            if (!name) return null;

            return {
                name,
                sortName: alias.sortName || alias['sort-name'] || null,
                locale: alias.locale || null,
                type: alias.type || null,
                primary: typeof alias.primary === 'boolean' ? alias.primary : null,
                ended: typeof alias.ended === 'boolean' ? alias.ended : null,
                begin: alias.begin || null,
                end: alias.end || null,
            };
        })
        .filter((alias): alias is CatalogAlias => !!alias);
}

function getAliasNames(record: SeedArtist) {
    const aliasNames = getAliases(record).flatMap((alias) => [
        alias.name,
        alias.sortName
    ]);

    return uniqueTexts([...(record.aliasNames || []), ...aliasNames]);
}

function normalizeCountry(value: string | null | undefined) {
    const trimmed = value?.trim().toUpperCase();
    return trimmed || null;
}

function hostFor(url: string) {
    try {
        return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        return null;
    }
}

function categoryFor(relationType: string, url: string) {
    const type = relationType.toLowerCase();
    const host = hostFor(url);

    if (type.includes('social') || ['instagram.com', 'twitter.com', 'x.com', 'tiktok.com', 'facebook.com'].includes(host || '')) {
        return 'social';
    }

    if (type.includes('stream') || ['open.spotify.com', 'music.apple.com', 'soundcloud.com', 'youtube.com', 'youtu.be'].includes(host || '')) {
        return 'streaming';
    }

    if (type.includes('purchase') || type.includes('download') || ['bandcamp.com', 'mora.jp', 'ototoy.jp'].includes(host || '')) {
        return 'purchase';
    }

    if (type.includes('homepage') || type === 'official homepage') {
        return 'official';
    }

    if (type.includes('wikidata') || host === 'wikidata.org') {
        return 'database';
    }

    return 'external';
}

function primaryUrls(record: SeedArtist) {
    return new Set([
        record.websiteUrl,
        record.wikidataUrl,
        record.instagramUrl,
        record.twitterUrl,
        record.tiktokUrl,
        record.youtubeUrl,
        record.spotifyUrl,
        record.appleMusicUrl,
        record.bandcampUrl,
        record.soundcloudUrl
    ].filter((value): value is string => !!value));
}

function addLink(links: Map<string, LinkRow>, artistMbid: string, url: string | undefined | null, relationType: string, isPrimary: boolean) {
    const trimmed = url?.trim();
    if (!trimmed) return;

    const existing = links.get(trimmed);
    const category = categoryFor(relationType, trimmed);

    if (existing) {
        existing.isPrimary = existing.isPrimary || isPrimary;
        if (existing.category === 'external' && category !== 'external') existing.category = category;
        if (existing.relationType === 'url' && relationType !== 'url') existing.relationType = relationType;
        return;
    }

    links.set(trimmed, {
        artistMbid,
        url: trimmed,
        host: hostFor(trimmed),
        relationType,
        category,
        isPrimary
    });
}

function transformSeedRecord(record: SeedArtist): { artist: ArtistRow; links: LinkRow[] } | null {
    const mbid = nullableUuid(record.mbid);
    const name = nullableText(record.name);

    if (!mbid || !name) {
        return null;
    }

    const popularity = record.popularity || null;
    const regionalRanks = Array.isArray(popularity?.regionalRanks) ? popularity.regionalRanks : [];
    const aliases = getAliases(record);
    const aliasNames = getAliasNames(record);
    const links = new Map<string, LinkRow>();
    const primary = primaryUrls(record);

    for (const [url, relationType] of [
        [record.websiteUrl, 'official homepage'],
        [record.wikidataUrl, 'wikidata'],
        [record.instagramUrl, 'social network'],
        [record.twitterUrl, 'social network'],
        [record.tiktokUrl, 'social network'],
        [record.youtubeUrl, 'youtube'],
        [record.spotifyUrl, 'free streaming'],
        [record.appleMusicUrl, 'streaming'],
        [record.bandcampUrl, 'bandcamp'],
        [record.soundcloudUrl, 'soundcloud'],
    ] as Array<[string | null | undefined, string]>) {
        addLink(links, mbid, url, relationType, true);
    }

    for (const url of record.streamingLinks || []) addLink(links, mbid, url, 'streaming', primary.has(url));
    for (const url of record.purchaseLinks || []) addLink(links, mbid, url, 'purchase for download', primary.has(url));
    for (const url of record.socialLinks || []) addLink(links, mbid, url, 'social network', primary.has(url));

    for (const link of record.externalLinks || []) {
        addLink(links, mbid, link.url, link.type || 'url', primary.has(link.url || ''));
    }

    return {
        artist: {
            mbid,
            name,
            sortName: nullableText(record.sortName),
            type: nullableText(record.type),
            country: normalizeCountry(record.country),
            areaName: nullableText(record.areaName),
            areaMbid: nullableUuid(record.areaMbid),
            beginAreaName: nullableText(record.beginAreaName),
            beginAreaMbid: nullableUuid(record.beginAreaMbid),
            lifeSpanBegin: nullableText(record.lifeSpanBegin),
            lifeSpanEnd: nullableText(record.lifeSpanEnd),
            ended: record.ended ?? null,
            disambiguation: nullableText(record.disambiguation),
            aliases,
            aliasNames,
            aliasSearchText: aliasNames.join(' '),
            aliasCount: record.aliasCount || aliasNames.length,
            genreCount: record.genreCount || 0,
            tagCount: record.tagCount || 0,
            relationCount: record.relationCount || 0,
            websiteUrl: nullableText(record.websiteUrl),
            wikidataUrl: nullableText(record.wikidataUrl),
            instagramUrl: nullableText(record.instagramUrl),
            twitterUrl: nullableText(record.twitterUrl),
            tiktokUrl: nullableText(record.tiktokUrl),
            youtubeUrl: nullableText(record.youtubeUrl),
            spotifyUrl: nullableText(record.spotifyUrl),
            appleMusicUrl: nullableText(record.appleMusicUrl),
            bandcampUrl: nullableText(record.bandcampUrl),
            soundcloudUrl: nullableText(record.soundcloudUrl),
            seedSources: Array.isArray(record.seedSources) ? record.seedSources : [],
            popularity,
            globalRank: typeof popularity?.globalRank === 'number' ? popularity.globalRank : null,
            regionalRanks
        },
        links: [...links.values()]
    };
}

function artistValues(row: ArtistRow) {
    return [
        row.mbid,
        row.name,
        row.sortName,
        row.type,
        row.country,
        row.areaName,
        row.areaMbid,
        row.beginAreaName,
        row.beginAreaMbid,
        row.lifeSpanBegin,
        row.lifeSpanEnd,
        row.ended,
        row.disambiguation,
        JSON.stringify(row.aliases),
        row.aliasNames,
        row.aliasSearchText,
        row.aliasCount,
        row.genreCount,
        row.tagCount,
        row.relationCount,
        row.websiteUrl,
        row.wikidataUrl,
        row.instagramUrl,
        row.twitterUrl,
        row.tiktokUrl,
        row.youtubeUrl,
        row.spotifyUrl,
        row.appleMusicUrl,
        row.bandcampUrl,
        row.soundcloudUrl,
        row.seedSources,
        row.popularity ? JSON.stringify(row.popularity) : null,
        row.globalRank,
        JSON.stringify(row.regionalRanks)
    ];
}

async function upsertArtists(rows: ArtistRow[]) {
    if (rows.length === 0) return;

    const columns = [
        'mbid',
        'name',
        'sort_name',
        'type',
        'country',
        'area_name',
        'area_mbid',
        'begin_area_name',
        'begin_area_mbid',
        'life_span_begin',
        'life_span_end',
        'ended',
        'disambiguation',
        'aliases',
        'alias_names',
        'alias_search_text',
        'alias_count',
        'genre_count',
        'tag_count',
        'relation_count',
        'website_url',
        'wikidata_url',
        'instagram_url',
        'twitter_url',
        'tiktok_url',
        'youtube_url',
        'spotify_url',
        'apple_music_url',
        'bandcamp_url',
        'soundcloud_url',
        'seed_sources',
        'popularity',
        'global_rank',
        'regional_ranks'
    ];

    const values = rows.flatMap(artistValues);
    const placeholders = rows.map((_, rowIndex) => {
        const offset = rowIndex * columns.length;
        return `(${columns.map((__, columnIndex) => `$${offset + columnIndex + 1}`).join(', ')})`;
    }).join(', ');

    await pool.query(`
        INSERT INTO public.musicbrainz_artists (${columns.join(', ')})
        VALUES ${placeholders}
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
            alias_names = EXCLUDED.alias_names,
            alias_search_text = EXCLUDED.alias_search_text,
            alias_count = EXCLUDED.alias_count,
            genre_count = EXCLUDED.genre_count,
            tag_count = EXCLUDED.tag_count,
            relation_count = EXCLUDED.relation_count,
            website_url = EXCLUDED.website_url,
            wikidata_url = EXCLUDED.wikidata_url,
            instagram_url = EXCLUDED.instagram_url,
            twitter_url = EXCLUDED.twitter_url,
            tiktok_url = EXCLUDED.tiktok_url,
            youtube_url = EXCLUDED.youtube_url,
            spotify_url = EXCLUDED.spotify_url,
            apple_music_url = EXCLUDED.apple_music_url,
            bandcamp_url = EXCLUDED.bandcamp_url,
            soundcloud_url = EXCLUDED.soundcloud_url,
            seed_sources = EXCLUDED.seed_sources,
            popularity = EXCLUDED.popularity,
            global_rank = EXCLUDED.global_rank,
            regional_ranks = EXCLUDED.regional_ranks
    `, values);
}

async function upsertLinks(rows: LinkRow[]) {
    if (rows.length === 0) return;

    const columns = ['artist_mbid', 'url', 'host', 'relation_type', 'category', 'is_primary'];
    const values = rows.flatMap((row) => [
        row.artistMbid,
        row.url,
        row.host,
        row.relationType,
        row.category,
        row.isPrimary
    ]);
    const placeholders = rows.map((_, rowIndex) => {
        const offset = rowIndex * columns.length;
        return `(${columns.map((__, columnIndex) => `$${offset + columnIndex + 1}`).join(', ')})`;
    }).join(', ');

    await pool.query(`
        INSERT INTO public.musicbrainz_artist_links (${columns.join(', ')})
        VALUES ${placeholders}
        ON CONFLICT (artist_mbid, url) DO UPDATE SET
            host = EXCLUDED.host,
            relation_type = EXCLUDED.relation_type,
            category = EXCLUDED.category,
            is_primary = public.musicbrainz_artist_links.is_primary OR EXCLUDED.is_primary
    `, values);
}

async function runMigration() {
    for (const filePath of [migrationPath, artistLinkMigrationPath]) {
        console.log(`Applying migration: ${filePath}`);
        const sql = fs.readFileSync(filePath, 'utf8');
        await pool.query(sql);
    }
}

async function runSearchIndexesMigration() {
    const sql = fs.readFileSync(searchIndexesMigrationPath, 'utf8');
    await pool.query(sql);
}

async function printStatus() {
    const result = await pool.query(`
        SELECT
            to_regclass('public.musicbrainz_artists') IS NOT NULL AS has_artists_table,
            to_regclass('public.musicbrainz_artist_links') IS NOT NULL AS has_links_table
    `);
    const status = result.rows[0] as { has_artists_table: boolean; has_links_table: boolean };

    if (!status.has_artists_table || !status.has_links_table) {
        console.log(`musicbrainz_artists table: ${status.has_artists_table ? 'exists' : 'missing'}`);
        console.log(`musicbrainz_artist_links table: ${status.has_links_table ? 'exists' : 'missing'}`);
        return;
    }

    const counts = await pool.query(`
        SELECT
            (SELECT COUNT(*)::int FROM public.musicbrainz_artists) AS artist_count,
            (SELECT COUNT(*)::int FROM public.musicbrainz_artist_links) AS link_count
    `);
    console.log(`musicbrainz_artists: ${Number(counts.rows[0].artist_count).toLocaleString()}`);
    console.log(`musicbrainz_artist_links: ${Number(counts.rows[0].link_count).toLocaleString()}`);
}

function progressLine(importedArtists: number, importedLinks: number, startedAt: number) {
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const artistsPerSecond = Math.round(importedArtists / elapsedSeconds);
    return `Progress: ${importedArtists.toLocaleString()} artists, ${importedLinks.toLocaleString()} links (${artistsPerSecond.toLocaleString()} artists/s, ${elapsedSeconds}s)`;
}

async function main() {
    const args = process.argv.slice(2);
    if (hasFlag(args, '--help')) {
        printHelp();
        return;
    }

    const inputPath = path.resolve(getArgValue(args, '--input') || defaultInputPath);
    const batchSize = toNumber(getArgValue(args, '--batch-size'), 500);
    const linkBatchSize = toNumber(getArgValue(args, '--link-batch-size'), 1000);
    const statementTimeoutMs = toNumber(getArgValue(args, '--statement-timeout-ms'), 60_000);
    const limit = toNumber(getArgValue(args, '--limit'), 0);
    const dryRun = hasFlag(args, '--dry-run');
    const migrate = hasFlag(args, '--migrate');
    const migrateOnly = hasFlag(args, '--migrate-only');
    const createIndexes = hasFlag(args, '--create-indexes');
    const status = hasFlag(args, '--status');
    const skipLinks = hasFlag(args, '--skip-links');

    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
    }

    console.log(`Input: ${inputPath}`);
    console.log(`Mode: ${dryRun ? 'dry-run' : 'database import'}`);

    if (!dryRun) {
        await pool.query(`SET statement_timeout = ${statementTimeoutMs}`);
        console.log(`Statement timeout: ${statementTimeoutMs.toLocaleString()} ms`);
    }

    if (status) {
        await printStatus();
        return;
    }

    if (createIndexes) {
        if (dryRun) {
            console.log(`Dry run: search-index migration skipped (${searchIndexesMigrationPath})`);
            return;
        }

        console.log(`Running search-index migration: ${searchIndexesMigrationPath}`);
        await runSearchIndexesMigration();
        console.log('Search-index migration done.');
        return;
    }

    if ((migrate || migrateOnly) && !dryRun) {
        console.log(`Running migration: ${migrationPath}`);
        await runMigration();
        console.log('Migration done.');
    } else if ((migrate || migrateOnly) && dryRun) {
        console.log(`Dry run: migrations skipped (${migrationPath}, ${artistLinkMigrationPath})`);
    }

    if (migrateOnly) {
        return;
    }

    const input = fs.createReadStream(inputPath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    let parsed = 0;
    let skipped = 0;
    let importedArtists = 0;
    let importedLinks = 0;
    let artistBatch: ArtistRow[] = [];
    let linkBatch: LinkRow[] = [];
    const startedAt = Date.now();

    const flushArtists = async () => {
        if (artistBatch.length === 0) return;

        if (dryRun) {
            importedArtists += artistBatch.length;
        } else {
            await upsertArtists(artistBatch);
            importedArtists += artistBatch.length;
        }

        artistBatch = [];
    };

    const flushLinks = async () => {
        if (skipLinks || linkBatch.length === 0) return;

        if (dryRun) {
            importedLinks += linkBatch.length;
        } else {
            await upsertLinks(linkBatch);
            importedLinks += linkBatch.length;
        }

        linkBatch = [];
    };

    const flush = async (forceLog = false) => {
        await flushArtists();
        await flushLinks();

        if (forceLog || importedArtists % Math.max(batchSize * 10, 1_000) === 0) {
            console.log(progressLine(importedArtists, importedLinks, startedAt));
        }
    };

    for await (const line of rl) {
        if (!line.trim()) continue;

        try {
            const transformed = transformSeedRecord(JSON.parse(line) as SeedArtist);
            if (!transformed) {
                skipped += 1;
                continue;
            }

            artistBatch.push(transformed.artist);
            if (!skipLinks) linkBatch.push(...transformed.links);
            parsed += 1;

            if (artistBatch.length >= batchSize) {
                await flushArtists();
            }

            if (linkBatch.length >= linkBatchSize) {
                await flushArtists();
                await flushLinks();
            }

            if (parsed % Math.max(batchSize * 10, 1_000) === 0) {
                console.log(progressLine(importedArtists + artistBatch.length, importedLinks + linkBatch.length, startedAt));
            }

            if (limit > 0 && parsed >= limit) {
                break;
            }
        } catch {
            skipped += 1;
        }
    }

    await flush(true);
    console.log();
    console.log('Done.');
    console.log(`Parsed: ${parsed.toLocaleString()}`);
    console.log(`Skipped: ${skipped.toLocaleString()}`);
    console.log(`${dryRun ? 'Would import' : 'Imported'} artists: ${importedArtists.toLocaleString()}`);
    console.log(`${dryRun ? 'Would import' : 'Imported'} links: ${importedLinks.toLocaleString()}`);
    console.log(`Elapsed: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
