import 'dotenv/config';
import pool from '../config/database';

type AppArtist = {
    id: string;
    name: string;
    musicbrainz_mbid: string | null;
    romanized_name: string | null;
};

type MusicBrainzCandidate = {
    mbid: string;
    name: string;
    sort_name: string | null;
    type: string | null;
    country: string | null;
    area_name: string | null;
    begin_area_name: string | null;
    relation_count: number;
    global_rank: number | null;
    website_url: string | null;
    instagram_url: string | null;
    twitter_url: string | null;
    youtube_url: string | null;
    apple_music_url: string | null;
};

type MatchResult =
    | { status: 'matched'; artist: AppArtist; candidate: MusicBrainzCandidate }
    | { status: 'ambiguous'; artist: AppArtist; candidates: MusicBrainzCandidate[] }
    | { status: 'unmatched'; artist: AppArtist };

function hasFlag(args: string[], name: string): boolean {
    return args.includes(name);
}

function getArgValue(args: string[], name: string): string | undefined {
    const prefix = `${name}=`;
    const inline = args.find((arg) => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);

    const index = args.indexOf(name);
    if (index >= 0) return args[index + 1];

    return undefined;
}

function toPositiveInt(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function printHelp() {
    console.log(`
Backfill existing app artists with MusicBrainz MBIDs, romanized names, and missing links.

Usage:
  npm run mb:backfill-artists
  npm run mb:backfill-artists -- --apply
  npm run mb:backfill-artists -- --limit 100

Options:
  --apply          Write exact unambiguous matches to artists.
  --links-only     Fill missing links for already-linked artists.
  --limit <n>      Process at most n app artists.
  --help           Show this help.

Notes:
  Dry-run is the default.
  The script never changes images or locations.
  Existing artist links are preserved; only empty link fields are filled.
  Matching uses the existing Supabase musicbrainz_artists table only.
`);
}

function formatCandidate(candidate: MusicBrainzCandidate): string {
    const meta = [
        candidate.type,
        candidate.country,
        candidate.begin_area_name || candidate.area_name,
        candidate.global_rank ? `rank ${candidate.global_rank}` : null,
        `relations ${candidate.relation_count}`,
    ].filter(Boolean).join(', ');

    return `${candidate.name}${candidate.sort_name && candidate.sort_name !== candidate.name ? ` / ${candidate.sort_name}` : ''} (${meta}) ${candidate.mbid}`;
}

async function getExistingArtists(limit?: number): Promise<AppArtist[]> {
    const values: unknown[] = [];
    const limitClause = limit ? 'LIMIT $1' : '';
    if (limit) values.push(limit);

    const result = await pool.query<AppArtist>(`
        SELECT id, name, musicbrainz_mbid, romanized_name
        FROM artists
        WHERE musicbrainz_mbid IS NULL
           OR romanized_name IS NULL
        ORDER BY created_at ASC
        ${limitClause}
    `, values);

    return result.rows;
}

async function getLinkedArtistsMissingLinks(limit?: number): Promise<AppArtist[]> {
    const values: unknown[] = [];
    const limitClause = limit ? 'LIMIT $1' : '';
    if (limit) values.push(limit);

    const result = await pool.query<AppArtist>(`
        SELECT id, name, musicbrainz_mbid, romanized_name
        FROM artists
        WHERE musicbrainz_mbid IS NOT NULL
          AND (
              website_url IS NULL
              OR instagram_url IS NULL
              OR twitter_url IS NULL
              OR youtube_url IS NULL
              OR apple_music_url IS NULL
          )
        ORDER BY created_at ASC
        ${limitClause}
    `, values);

    return result.rows;
}

async function getCandidateByMbid(mbid: string): Promise<MusicBrainzCandidate | null> {
    const result = await pool.query<MusicBrainzCandidate>(`
        SELECT
            mbid, name, sort_name, type, country, area_name, begin_area_name,
            relation_count, global_rank, website_url, instagram_url, twitter_url,
            youtube_url, apple_music_url
        FROM musicbrainz_artists
        WHERE mbid = $1
    `, [mbid]);

    return result.rows[0] || null;
}

async function findCandidates(name: string): Promise<MusicBrainzCandidate[]> {
    const result = await pool.query<MusicBrainzCandidate>(`
        SELECT
            mbid, name, sort_name, type, country, area_name, begin_area_name,
            relation_count, global_rank, website_url, instagram_url, twitter_url,
            youtube_url, apple_music_url
        FROM musicbrainz_artists
        WHERE lower(name) = lower($1)
           OR lower(sort_name) = lower($1)
        ORDER BY
            CASE WHEN lower(name) = lower($1) THEN 0 ELSE 1 END,
            CASE WHEN global_rank IS NULL THEN 1 ELSE 0 END,
            global_rank ASC NULLS LAST,
            relation_count DESC,
            name ASC
        LIMIT 10
    `, [name.trim()]);

    return result.rows;
}

function chooseMatch(artist: AppArtist, candidates: MusicBrainzCandidate[]): MatchResult {
    if (candidates.length === 0) {
        return { status: 'unmatched', artist };
    }

    if (candidates.length === 1) {
        return { status: 'matched', artist, candidate: candidates[0] };
    }

    const normalized = artist.name.trim().toLowerCase();
    const exactNameMatches = candidates.filter((candidate) => candidate.name.trim().toLowerCase() === normalized);
    const exactSortMatches = candidates.filter((candidate) => candidate.sort_name?.trim().toLowerCase() === normalized);

    if (exactNameMatches.length === 1 && exactSortMatches.length === 0) {
        return { status: 'matched', artist, candidate: exactNameMatches[0] };
    }

    if (exactNameMatches.length === 0 && exactSortMatches.length === 1) {
        return { status: 'matched', artist, candidate: exactSortMatches[0] };
    }

    return { status: 'ambiguous', artist, candidates };
}

async function applyMatch(match: Extract<MatchResult, { status: 'matched' }>) {
    const romanizedName =
        match.candidate.sort_name && match.candidate.sort_name !== match.candidate.name
            ? match.candidate.sort_name
            : null;

    await pool.query(`
        UPDATE artists
        SET
            musicbrainz_mbid = COALESCE(musicbrainz_mbid, $1),
            romanized_name = COALESCE(romanized_name, $2),
            website_url = COALESCE(website_url, $3),
            instagram_url = COALESCE(instagram_url, $4),
            twitter_url = COALESCE(twitter_url, $5),
            youtube_url = COALESCE(youtube_url, $6),
            apple_music_url = COALESCE(apple_music_url, $7)
        WHERE id = $8
    `, [
        match.candidate.mbid,
        romanizedName,
        match.candidate.website_url,
        match.candidate.instagram_url,
        match.candidate.twitter_url,
        match.candidate.youtube_url,
        match.candidate.apple_music_url,
        match.artist.id
    ]);
}

function formatFilledLinks(candidate: MusicBrainzCandidate): string {
    const fields = [
        candidate.website_url ? 'website' : null,
        candidate.instagram_url ? 'instagram' : null,
        candidate.twitter_url ? 'twitter' : null,
        candidate.youtube_url ? 'youtube' : null,
        candidate.apple_music_url ? 'appleMusic' : null,
    ].filter(Boolean);

    return fields.length > 0 ? fields.join(', ') : 'no canonical links';
}

async function main() {
    const args = process.argv.slice(2);
    if (hasFlag(args, '--help')) {
        printHelp();
        return;
    }

    const apply = hasFlag(args, '--apply');
    const linksOnly = hasFlag(args, '--links-only');
    const limit = toPositiveInt(getArgValue(args, '--limit'));
    const artists = linksOnly ? await getLinkedArtistsMissingLinks(limit) : await getExistingArtists(limit);

    let matched = 0;
    let applied = 0;
    let ambiguous = 0;
    let unmatched = 0;

    console.log(`Mode: ${apply ? 'apply' : 'dry-run'}`);
    console.log(`Scope: ${linksOnly ? 'already-linked missing links' : 'match and link artists'}`);
    console.log(`Checking ${artists.length} existing artists`);

    for (const artist of artists) {
        const result = artist.musicbrainz_mbid
            ? await getCandidateByMbid(artist.musicbrainz_mbid).then((candidate): MatchResult => (
                candidate ? { status: 'matched', artist, candidate } : { status: 'unmatched', artist }
            ))
            : chooseMatch(artist, await findCandidates(artist.name));

        if (result.status === 'matched') {
            matched++;
            console.log(`[match] ${artist.name} -> ${formatCandidate(result.candidate)}; links: ${formatFilledLinks(result.candidate)}`);
            if (apply) {
                await applyMatch(result);
                applied++;
            }
        } else if (result.status === 'ambiguous') {
            ambiguous++;
            console.log(`[ambiguous] ${artist.name}`);
            result.candidates.slice(0, 5).forEach((candidate) => {
                console.log(`  - ${formatCandidate(candidate)}`);
            });
        } else {
            unmatched++;
            console.log(`[unmatched] ${artist.name}`);
        }
    }

    console.log('Done.');
    console.log(`Matched: ${matched}`);
    console.log(`Applied: ${applied}`);
    console.log(`Ambiguous: ${ambiguous}`);
    console.log(`Unmatched: ${unmatched}`);

    await pool.end();
}

main().catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
});
