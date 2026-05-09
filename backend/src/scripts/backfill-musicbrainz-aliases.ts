import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import pool from '../config/database';

type MbdumpArtist = {
    id?: string;
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

type AliasRow = {
    mbid: string;
    aliases: CatalogAlias[];
    aliasNames: string[];
    aliasSearchText: string;
};

const defaultInputPath = path.resolve(__dirname, '../../data/artist/mbdump/artist');

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

function logStatus(message: string, status: Record<string, unknown>) {
    console.log(`${new Date().toISOString()} ${message} ${JSON.stringify(status)}`);
}

function formatDuration(ms: number) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function ratePerSecond(count: number, startedAt: number) {
    const elapsedSeconds = Math.max(1, (Date.now() - startedAt) / 1000);
    return Math.round(count / elapsedSeconds);
}

function uniqueTexts(values: Array<string | null | undefined>) {
    return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value))];
}

function getAliasNames(record: MbdumpArtist) {
    return uniqueTexts(getAliases(record).flatMap((alias) => [
        alias.name,
        alias.sortName
    ]));
}

function getAliases(record: MbdumpArtist): CatalogAlias[] {
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

async function updateAliases(rows: AliasRow[], overwrite: boolean) {
    if (rows.length === 0) return 0;

    const values = rows.flatMap((row) => [row.mbid, JSON.stringify(row.aliases), row.aliasNames, row.aliasSearchText]);
    const placeholders = rows.map((_, rowIndex) => {
        const offset = rowIndex * 4;
        return `($${offset + 1}::uuid, $${offset + 2}::jsonb, $${offset + 3}::text[], $${offset + 4}::text)`;
    }).join(', ');

    const condition = overwrite ? '' : "AND COALESCE(a.alias_search_text, '') = ''";
    const result = await pool.query(`
        UPDATE public.musicbrainz_artists AS a
        SET
            aliases = v.aliases,
            alias_names = v.alias_names,
            alias_search_text = v.alias_search_text
        FROM (VALUES ${placeholders}) AS v(mbid, aliases, alias_names, alias_search_text)
        WHERE a.mbid = v.mbid
          AND v.alias_search_text <> ''
          ${condition}
    `, values);

    return result.rowCount || 0;
}

async function main() {
    const args = process.argv.slice(2);
    const inputPath = path.resolve(getArgValue(args, '--input') || defaultInputPath);
    const batchSize = toNumber(getArgValue(args, '--batch-size'), 500);
    const limit = toNumber(getArgValue(args, '--limit'), Number.POSITIVE_INFINITY);
    const overwrite = hasFlag(args, '--overwrite');
    const dryRun = hasFlag(args, '--dry-run');
    const progressEvery = toNumber(getArgValue(args, '--progress-every'), 10000);
    const progressSeconds = toNumber(getArgValue(args, '--progress-seconds'), 15);
    const inputSize = fs.existsSync(inputPath) ? fs.statSync(inputPath).size : 0;

    let scanned = 0;
    let parsed = 0;
    let candidates = 0;
    let updated = 0;
    let batches = 0;
    let bytesRead = 0;
    let lastProgressAt = Date.now();
    const startedAt = Date.now();
    let batch: AliasRow[] = [];

    const progressPayload = () => ({
        scanned,
        parsed,
        candidates,
        updated,
        pendingBatchRows: batch.length,
        batches,
        elapsed: formatDuration(Date.now() - startedAt),
        scannedPerSecond: ratePerSecond(scanned, startedAt),
        updatedPerSecond: ratePerSecond(updated, startedAt),
        percent: inputSize > 0 ? Number(((bytesRead / inputSize) * 100).toFixed(2)) : null
    });

    const logProgress = (message = 'progress') => {
        logStatus(message, progressPayload());
        lastProgressAt = Date.now();
    };

    const flush = async () => {
        if (batch.length === 0) return;
        const batchRows = batch.length;
        logStatus('batch starting', {
            batch: batches + 1,
            batchRows,
            scanned,
            candidates,
            dryRun
        });
        if (dryRun) {
            updated += batch.length;
        } else {
            updated += await updateAliases(batch, overwrite);
        }
        batches += 1;
        logStatus('batch complete', {
            batch: batches,
            batchRows,
            scanned,
            candidates,
            updated,
            elapsed: formatDuration(Date.now() - startedAt)
        });
        batch = [];
    };

    const stream = fs.createReadStream(inputPath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    logStatus('starting alias backfill', {
        inputPath,
        batchSize,
        limit: Number.isFinite(limit) ? limit : null,
        overwrite,
        dryRun,
        progressEvery,
        progressSeconds,
        inputSizeBytes: inputSize || null
    });

    for await (const line of rl) {
        scanned += 1;
        bytesRead += Buffer.byteLength(line, 'utf8') + 1;
        if (
            scanned % progressEvery === 0
            || Date.now() - lastProgressAt >= progressSeconds * 1000
        ) {
            logProgress();
        }

        if (!line.trim()) continue;

        let record: MbdumpArtist;
        try {
            record = JSON.parse(line) as MbdumpArtist;
        } catch {
            continue;
        }

        parsed += 1;
        if (!record.id) continue;

        const aliases = getAliases(record);
        const aliasNames = getAliasNames(record);
        if (aliasNames.length === 0) continue;

        candidates += 1;
        batch.push({
            mbid: record.id,
            aliases,
            aliasNames,
            aliasSearchText: aliasNames.join(' ')
        });

        if (batch.length >= batchSize) {
            await flush();
        }

        if (candidates >= limit) break;
    }

    await flush();
    logProgress('final progress');
    await pool.end();

    console.log(JSON.stringify({
        inputPath,
        scanned,
        parsed,
        candidates,
        updated,
        batches,
        elapsed: formatDuration(Date.now() - startedAt),
        dryRun,
        overwrite
    }, null, 2));
}

main().catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
});
