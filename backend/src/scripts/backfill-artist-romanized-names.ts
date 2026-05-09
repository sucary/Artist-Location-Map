import 'dotenv/config';
import pool from '../config/database';

type ArtistRomanizedRow = {
    artist_id: string;
    artist_name: string;
    current_romanized_name: string | null;
    musicbrainz_mbid: string;
    musicbrainz_name: string;
    sort_name: string | null;
    aliases: unknown;
};

type CatalogAlias = {
    name: string;
    sortName: string | null;
    locale: string | null;
    type: string | null;
    primary: boolean | null;
};

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

function toPositiveInt(value: string | undefined, fallback: number) {
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function printHelp() {
    console.log(`
Backfill existing app artist romanized names from structured MusicBrainz aliases.

Usage:
  npm run mb:backfill-romanized
  npm run mb:backfill-romanized -- --apply
  npm run mb:backfill-romanized -- --apply --overwrite

Options:
  --apply              Write updates. Dry-run is the default.
  --overwrite          Also replace non-sort-name romanized values.
  --limit <n>          Process at most n linked artists.
  --progress-every <n> Log progress every n changed candidates. Default: 500.
  --help               Show this help.

Default behavior only updates safe rows where romanized_name is empty or still equals
the old MusicBrainz sort_name, such as "Chou, Jay". Manual values are preserved.
`);
}

function normalizeAliases(aliases: unknown): CatalogAlias[] {
    if (!Array.isArray(aliases)) return [];

    return aliases
        .map((alias) => {
            const value = alias as { name?: string; sortName?: string | null; locale?: string | null; type?: string | null; primary?: boolean | null };
            const name = value.name?.trim();
            if (!name) return null;

            return {
                name,
                sortName: value.sortName || null,
                locale: value.locale || null,
                type: value.type || null,
                primary: typeof value.primary === 'boolean' ? value.primary : null,
            };
        })
        .filter((alias): alias is CatalogAlias => !!alias);
}

function cleanSortName(sortName?: string | null) {
    const value = sortName?.trim();
    if (!value) return null;

    const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
    return value;
}

function hasCjk(value: string) {
    return /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(value);
}

const romanizedNameOverrides = new Map<string, string>([
    ['らそんぶる', 'rassemble'],
]);

function getRomanizedNameOverride(name: string) {
    return romanizedNameOverrides.get(name.trim().toLowerCase()) || null;
}

function isOverrideRomanizedName(row: ArtistRomanizedRow, romanizedName: string | null) {
    return !!romanizedName && getRomanizedNameOverride(row.musicbrainz_name) === romanizedName;
}

function isDisplayRomanizedAlias(alias: CatalogAlias) {
    return !alias.name.includes(',') && !hasCjk(alias.name) && /[A-Za-z]/.test(alias.name);
}

function chooseRomanizedName(row: ArtistRomanizedRow) {
    const override = getRomanizedNameOverride(row.musicbrainz_name);
    if (override) return override;

    const aliases = normalizeAliases(row.aliases);
    const artistAliases = aliases.filter((alias) => alias.type === 'Artist name' || !alias.type);
    const englishPrimary = artistAliases.find((alias) => alias.locale === 'en' && alias.primary === true && isDisplayRomanizedAlias(alias));
    const english = englishPrimary || artistAliases.find((alias) => alias.locale === 'en' && isDisplayRomanizedAlias(alias));
    const latin = english || artistAliases.find(isDisplayRomanizedAlias);
    const fallback = cleanSortName(row.sort_name);
    const romanizedName = latin?.name || fallback;

    return romanizedName && romanizedName !== row.musicbrainz_name ? romanizedName : null;
}

function isSafeToUpdate(row: ArtistRomanizedRow, nextRomanizedName: string | null, overwrite: boolean) {
    if (!nextRomanizedName) return false;

    const current = row.current_romanized_name?.trim();
    if (!current) return true;
    if (current === nextRomanizedName) return false;
    if (isOverrideRomanizedName(row, nextRomanizedName)) return true;
    if (overwrite) return true;

    return !!row.sort_name && current === row.sort_name.trim();
}

async function getLinkedArtists(limit: number) {
    const result = await pool.query<ArtistRomanizedRow>(`
        SELECT
            a.id AS artist_id,
            a.name AS artist_name,
            a.romanized_name AS current_romanized_name,
            a.musicbrainz_mbid,
            mba.name AS musicbrainz_name,
            mba.sort_name,
            mba.aliases
        FROM public.artists a
        JOIN public.musicbrainz_artists mba ON mba.mbid = a.musicbrainz_mbid
        ORDER BY a.created_at ASC
        LIMIT $1
    `, [limit]);

    return result.rows;
}

async function updateRomanizedName(artistId: string, romanizedName: string) {
    await pool.query(`
        UPDATE public.artists
        SET romanized_name = $1
        WHERE id = $2
    `, [romanizedName, artistId]);
}

async function main() {
    const args = process.argv.slice(2);
    if (hasFlag(args, '--help')) {
        printHelp();
        return;
    }

    const apply = hasFlag(args, '--apply');
    const overwrite = hasFlag(args, '--overwrite');
    const limit = toPositiveInt(getArgValue(args, '--limit'), 1_000_000);
    const progressEvery = toPositiveInt(getArgValue(args, '--progress-every'), 500);
    const rows = await getLinkedArtists(limit);

    let checked = 0;
    let candidates = 0;
    let updated = 0;
    let skipped = 0;

    console.log(`Mode: ${apply ? 'apply' : 'dry-run'}`);
    console.log(`Overwrite manual values: ${overwrite ? 'yes' : 'no'}`);
    console.log(`Checking ${rows.length.toLocaleString()} linked artists`);

    for (const row of rows) {
        checked += 1;
        const nextRomanizedName = chooseRomanizedName(row);

        if (!isSafeToUpdate(row, nextRomanizedName, overwrite)) {
            skipped += 1;
            continue;
        }

        candidates += 1;

        if (candidates <= 20) {
            console.log(`[candidate] ${row.artist_name}: ${row.current_romanized_name || '(empty)'} -> ${nextRomanizedName}`);
        }

        if (apply && nextRomanizedName) {
            await updateRomanizedName(row.artist_id, nextRomanizedName);
            updated += 1;
        }

        if (candidates % progressEvery === 0) {
            console.log(`Progress: checked=${checked.toLocaleString()} candidates=${candidates.toLocaleString()} updated=${updated.toLocaleString()} skipped=${skipped.toLocaleString()}`);
        }
    }

    console.log('Done.');
    console.log(`Checked: ${checked.toLocaleString()}`);
    console.log(`Candidates: ${candidates.toLocaleString()}`);
    console.log(`Updated: ${updated.toLocaleString()}`);
    console.log(`Skipped: ${skipped.toLocaleString()}`);

    await pool.end();
}

main().catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
});
