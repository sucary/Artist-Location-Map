import pool from '../config/database';
import {
    LocalizedChain,
    LocalizedLocation,
    LocalizedNames,
} from '../types/city';
import { CityService } from './cityService';
import { nominatimLimiter } from './nominatimRateLimiter';

/**
 * LocationLocalizationService — Wikidata-first multilingual lookup.
 *
 * Lazily populates `locations.localized_names` with a flat chain of
 * {city, province?, country?}, each holding {en, zhHans, zhHant, ja, native}.
 * Called from ArtistService.create / update the first time an artist is
 * saved with a given city, so downstream renders can show the location
 * in the user's preferred language.
 *
 * Strategy:
 *   1. Read the row. Short-circuit if `localized_at` is set (idempotent).
 *   2. ONE LocationIQ /lookup call with extratags=1 + namedetails=1 +
 *      accept-language=en. This returns:
 *        - extratags.wikidata (the OSM-tagged Wikidata Q-ID, if any)
 *        - namedetails (full name:* tag set merged across linked OSM
 *          entities, used as the city's name set in the fallback path)
 *        - address (state/country in English, used as one of the four
 *          per-language address responses in the fallback path)
 *   3. If extratags.wikidata is present:
 *        a. Fetch the Wikidata entity (labels + claims).
 *        b. Walk one P131 hop ("located in administrative territorial
 *           entity") to find the province QID.
 *        c. Read P17 ("country") for the country QID.
 *        d. Batch-fetch province + country in one Wikidata call.
 *        e. Build the LocalizedChain. Persist.
 *      → Total: 1 LocationIQ + 2 Wikidata = 3 calls.
 *   4. Otherwise (no wikidata tag, or Wikidata returned nothing useful):
 *      use the namedetails we already have for the city, then issue 3 more
 *      LocationIQ /lookup calls (zh-CN, zh-TW, ja) for parents in those
 *      languages. The English address from step 2 covers the en slot.
 *      → Total: 4 LocationIQ calls.
 *   5. If everything fails: return null. Caller (ArtistService) does not
 *      block on localization failure.
 *
 * Idempotent: a row whose `localized_at` is non-null short-circuits.
 *
 * See plans/multilingual_locations_plan.md.
 */

const LOCATIONIQ_BASE = 'https://us1.locationiq.com/v1';
const LOCATIONIQ_KEY = process.env.LOCATIONIQ_API_KEY;

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIDATA_BASE = 'https://www.wikidata.org/wiki/Special:EntityData';
const WIKIDATA_TIMEOUT_MS = 8_000;

interface WikidataLabel {
    language: string;
    value: string;
}
interface WikidataClaimValue {
    'entity-type'?: string;
    id?: string;
}
interface WikidataClaim {
    mainsnak?: {
        snaktype?: string;
        datavalue?: { value?: WikidataClaimValue };
    };
    rank?: 'preferred' | 'normal' | 'deprecated';
}
interface WikidataEntity {
    id: string;
    labels?: Record<string, WikidataLabel>;
    claims?: Record<string, WikidataClaim[]>;
}
interface WikidataResponse {
    entities?: Record<string, WikidataEntity>;
}

interface LocationIQAddress {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    province?: string;
    country?: string;
}
interface LocationIQNamedetails {
    [key: string]: string | undefined;
    name?: string;
    'name:en'?: string;
    'name:ja'?: string;
    'name:zh'?: string;
    'name:zh-Hans'?: string;
    'name:zh-Hant'?: string;
}
interface LocationIQExtratags {
    [key: string]: string | undefined;
    wikidata?: string;
}
interface LocationIQLookupResult {
    name?: string;
    address?: LocationIQAddress;
    namedetails?: LocationIQNamedetails;
    extratags?: LocationIQExtratags;
}

export const LocationLocalizationService = {
    /**
     * Idempotent multilingual localization. Short-circuits if already localized.
     */
    ensureLocalized: async (locationId: string): Promise<LocalizedLocation | null> => {
        try {
            const existing = await pool.query(
                `SELECT localized_at, localized_manual, osm_id, osm_type, name, province, country
                 FROM locations WHERE id = $1`,
                [locationId]
            );
            if (existing.rows.length === 0) {
                console.warn(`[localize] location ${locationId} not found`);
                return null;
            }
            const row = existing.rows[0];

            if (row.localized_manual || row.localized_at) {
                return CityService.getLocalizedById(locationId);
            }

            const osmId = Number(row.osm_id);
            const osmType: string = row.osm_type;
            const nativeName: string | null = row.name ?? null;

            // 1. Initial LocationIQ lookup to get Wikidata ID (if any) and namedetails for fallback.
            const initial = await fetchLocationIQLookup(osmId, osmType, 'en');
            if (!initial) {
                console.warn(`[localize] ${locationId} initial LocationIQ lookup failed`);
                return null;
            }

            const wikidataId = extractWikidataId(initial);

            // 2. Branch A: Wikidata path if we have a Wikidata ID. More efficient and richer data if it works, but more points of failure.
            let chain: LocalizedChain | null = null;
            if (wikidataId) {
                chain = await fetchChainFromWikidata(wikidataId, nativeName);
            }

            // 3. Branch B: LocationIQ-only fallback path. Uses the namedetails
            // we already have plus 3 more per-language address lookups.
            if (!chain) {
                if (wikidataId) {
                    console.warn(`[localize] ${locationId} Wikidata returned nothing for ${wikidataId}, falling back to LocationIQ-only`);
                }
                chain = await fetchChainFromLocationIQ(osmId, osmType, initial, nativeName);
            }

            if (!chain) {
                console.warn(`[localize] ${locationId} all providers failed`);
                return null;
            }

            // Override province/country with manual translations from
            // sibling locations (same province/country name) if available.
            await applyManualOverrides(chain, row.province, row.country);

            await persistChain(locationId, chain);
            return { id: locationId, chain };
        } catch (error) {
            console.error(`[localize] ensureLocalized failed for ${locationId}:`, error);
            return null;
        }
    },
};

// ─── LocationIQ ─────────────────────────────────────────────────────────

function osmIdsParam(osmId: number, osmType: string): string | null {
    if (osmType === 'relation') return `R${osmId}`;
    if (osmType === 'way') return `W${osmId}`;
    if (osmType === 'node') return `N${osmId}`;
    return null;
}

/**
 * One LocationIQ /lookup call with the maximal field set.
 */
async function fetchLocationIQLookup(
    osmId: number,
    osmType: string,
    acceptLanguage: string
): Promise<LocationIQLookupResult | null> {
    if (!LOCATIONIQ_KEY) {
        console.warn('[localize] LOCATIONIQ_API_KEY not set; skipping LocationIQ lookup');
        return null;
    }
    const osmIds = osmIdsParam(osmId, osmType);
    if (!osmIds) return null;

    const params = new URLSearchParams({
        osm_ids: osmIds,
        format: 'json',
        addressdetails: '1',
        extratags: '1',
        namedetails: '1',
        'accept-language': acceptLanguage,
    });
    const url = `${LOCATIONIQ_BASE}/lookup?${params.toString()}&key=${LOCATIONIQ_KEY}`;

    try {
        const response = await nominatimLimiter.enqueue(() =>
            fetch(url, { headers: { 'User-Agent': 'ArtistLocationMap/1.0 (localization)' } })
        );
        if (!response.ok) {
            console.warn(`[localize] LocationIQ lookup → ${response.status}`);
            return null;
        }
        const arr = (await response.json()) as LocationIQLookupResult[];
        return arr?.[0] ?? null;
    } catch (error) {
        console.warn(`[localize] LocationIQ lookup failed (${acceptLanguage}):`, error);
        return null;
    }
}

function extractWikidataId(result: LocationIQLookupResult): string | null {
    const tag = result.extratags?.wikidata;
    if (tag && /^Q\d+$/.test(tag)) return tag;
    return null;
}

function namesFromNamedetails(nd: LocationIQNamedetails | undefined, nativeName: string | null): LocalizedNames | null {
    if (!nd) return null;
    const names: LocalizedNames = {};
    if (nd['name:en'])      names.en     = nd['name:en'];
    if (nd['name:ja'])      names.ja     = nd['name:ja'];
    if (nd['name:zh-Hans']) names.zhHans = nd['name:zh-Hans'];
    if (nd['name:zh-Hant']) names.zhHant = nd['name:zh-Hant'];
    if (nd['name:zh']) {
        if (!names.zhHans) names.zhHans = nd['name:zh'];
        if (!names.zhHant) names.zhHant = nd['name:zh'];
    }
    if (nativeName) names.native = nativeName;
    else if (nd.name) names.native = nd.name;
    return Object.keys(names).length > 0 ? names : null;
}

/**
 * LocationIQ-only fallback chain builder. Called if no Wikidata ID is present or if the Wikidata path fails.
 */
async function fetchChainFromLocationIQ(
    osmId: number,
    osmType: string,
    initial: LocationIQLookupResult,
    nativeName: string | null
): Promise<LocalizedChain | null> {
    const cityNames = namesFromNamedetails(initial.namedetails, nativeName);
    if (!cityNames) return null;

    const provinceNames: LocalizedNames = {};
    const countryNames: LocalizedNames = {};

    // Fold the initial English-language address into the en slot.
    foldAddressInto(initial.address, 'en', provinceNames, countryNames);

    // Three more calls for the other languages.
    const langs: Array<{ accept: string; key: keyof LocalizedNames }> = [
        { accept: 'zh-CN', key: 'zhHans' },
        { accept: 'zh-TW', key: 'zhHant' },
        { accept: 'ja',    key: 'ja'     },
    ];
    for (const { accept, key } of langs) {
        const result = await fetchLocationIQLookup(osmId, osmType, accept);
        foldAddressInto(result?.address, key, provinceNames, countryNames);
    }

    const chain: LocalizedChain = { city: cityNames };
    if (Object.keys(provinceNames).length > 0) chain.province = provinceNames;
    if (Object.keys(countryNames).length > 0)  chain.country  = countryNames;
    return chain;
}

function foldAddressInto(
    address: LocationIQAddress | undefined,
    key: keyof LocalizedNames,
    provinceNames: LocalizedNames,
    countryNames: LocalizedNames
) {
    if (!address) return;
    const province = address.state ?? address.province;
    const country  = address.country;
    if (province) provinceNames[key] = province;
    if (country)  countryNames[key]  = country;
}

// ─── Wikidata ───────────────────────────────────────────────────────────

async function fetchWikidataEntities(qids: string[]): Promise<Record<string, WikidataEntity>> {
    if (qids.length === 0) return {};
    const params = new URLSearchParams({
        action: 'wbgetentities',
        ids: qids.join('|'),
        props: 'labels|claims',
        languages: 'en|ja|zh|zh-hans|zh-hant',
        format: 'json',
        origin: '*',
    });
    const url = `${WIKIDATA_API}?${params.toString()}`;
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), WIKIDATA_TIMEOUT_MS);
        const response = await fetch(url, {
            headers: { 'User-Agent': 'ArtistLocationMap/1.0 (localization)' },
            signal: controller.signal,
        });
        clearTimeout(t);
        if (!response.ok) {
            console.warn(`[localize] Wikidata wbgetentities → ${response.status}`);
            return await fetchEntityDataPerId(qids);
        }
        const json = (await response.json()) as WikidataResponse;
        return json.entities ?? {};
    } catch (error) {
        console.warn('[localize] Wikidata wbgetentities failed:', error);
        return await fetchEntityDataPerId(qids);
    }
}

async function fetchEntityDataPerId(qids: string[]): Promise<Record<string, WikidataEntity>> {
    const out: Record<string, WikidataEntity> = {};
    for (const qid of qids) {
        try {
            const url = `${WIKIDATA_BASE}/${qid}.json`;
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), WIKIDATA_TIMEOUT_MS);
            const response = await fetch(url, {
                headers: { 'User-Agent': 'ArtistLocationMap/1.0 (localization)' },
                signal: controller.signal,
            });
            clearTimeout(t);
            if (!response.ok) continue;
            const json = (await response.json()) as WikidataResponse;
            const entity = json.entities?.[qid];
            if (entity) out[qid] = entity;
        } catch (error) {
            console.warn(`[localize] Wikidata EntityData ${qid} failed:`, error);
        }
    }
    return out;
}

function extractLabels(entity: WikidataEntity | undefined, native?: string | null): LocalizedNames | null {
    if (!entity?.labels) return null;
    const labels = entity.labels;
    const names: LocalizedNames = {};
    if (labels.en?.value)         names.en     = labels.en.value;
    if (labels.ja?.value)         names.ja     = labels.ja.value;
    if (labels['zh-hans']?.value) names.zhHans = labels['zh-hans'].value;
    if (labels['zh-hant']?.value) names.zhHant = labels['zh-hant'].value;
    if (labels.zh?.value) {
        if (!names.zhHans) names.zhHans = labels.zh.value;
        if (!names.zhHant) names.zhHant = labels.zh.value;
    }
    if (native) names.native = native;
    return Object.keys(names).length > 0 ? names : null;
}

function firstActiveP131(entity: WikidataEntity): string | null {
    const claims = entity.claims?.P131 ?? [];
    for (const claim of claims) {
        if (claim.rank === 'deprecated') continue;
        const id = claim.mainsnak?.datavalue?.value?.id;
        if (id) return id;
    }
    return null;
}

function firstActiveP17(entity: WikidataEntity): string | null {
    const claims = entity.claims?.P17 ?? [];
    for (const claim of claims) {
        if (claim.rank === 'deprecated') continue;
        const id = claim.mainsnak?.datavalue?.value?.id;
        if (id) return id;
    }
    return null;
}

async function fetchChainFromWikidata(rootQid: string, nativeName: string | null): Promise<LocalizedChain | null> {
    const initial = await fetchWikidataEntities([rootQid]);
    const city = initial[rootQid];
    if (!city) return null;

    const cityNames = extractLabels(city, nativeName);
    if (!cityNames) return null;

    const provinceQid = firstActiveP131(city);
    const countryQidFromCity = firstActiveP17(city);

    const toFetch: string[] = [];
    if (provinceQid && provinceQid !== rootQid) toFetch.push(provinceQid);
    if (countryQidFromCity && countryQidFromCity !== rootQid) toFetch.push(countryQidFromCity);

    let parents = toFetch.length > 0 ? await fetchWikidataEntities(toFetch) : {};

    let countryQid = countryQidFromCity;
    if (!countryQid && provinceQid && parents[provinceQid]) {
        countryQid = firstActiveP17(parents[provinceQid]);
        if (countryQid && !parents[countryQid]) {
            const more = await fetchWikidataEntities([countryQid]);
            parents = { ...parents, ...more };
        }
    }

    // Walk one more P131 hop if the first hop landed on a sub-prefecture
    // entity (ward/district). Use the grandparent as province instead.
    let resolvedProvinceQid = provinceQid;
    if (provinceQid && countryQid && parents[provinceQid]) {
        const grandparentQid = firstActiveP131(parents[provinceQid]);
        if (grandparentQid && grandparentQid !== countryQid && grandparentQid !== rootQid) {
            if (!parents[grandparentQid]) {
                const more = await fetchWikidataEntities([grandparentQid]);
                parents = { ...parents, ...more };
            }
            resolvedProvinceQid = grandparentQid;
        }
    }

    const provinceNames = resolvedProvinceQid ? extractLabels(parents[resolvedProvinceQid]) : null;
    const countryNames  = countryQid  ? extractLabels(parents[countryQid])  : null;

    const chain: LocalizedChain = { city: cityNames };
    if (provinceNames) chain.province = provinceNames;
    if (countryNames)  chain.country  = countryNames;

    if (provinceQid && countryQid && provinceQid === countryQid) {
        delete chain.province;
    }

    return chain;
}

// ─── Manual overrides ──────────────────────────────────────────────────

/**
 * Look for sibling locations (same province or country) that have
 * localized_manual = true, and merge their province/country translations
 * into the chain so manual edits propagate to new locations automatically.
 *
 * Province and country overrides are matched independently to avoid
 * leaking a sibling's province into a location that doesn't share it
 * (e.g., a country-level entry matched only by country name).
 */
async function applyManualOverrides(
    chain: LocalizedChain,
    province: string | null,
    country: string | null
): Promise<void> {
    // Copy province translations from a sibling that shares the same province.
    if (province && province !== 'Unknown') {
        const sibProv = await pool.query(
            `SELECT localized_names FROM locations
             WHERE localized_manual = TRUE
               AND localized_names IS NOT NULL
               AND province = $1
             LIMIT 1`,
            [province]
        );
        if (sibProv.rows.length > 0) {
            const sibChain = sibProv.rows[0].localized_names as LocalizedChain;
            if (sibChain.province) {
                chain.province = { ...chain.province, ...sibChain.province };
            }
        }
    }

    // Copy country translations from a sibling that shares the same country.
    if (country && country !== 'Unknown') {
        const sibCountry = await pool.query(
            `SELECT localized_names FROM locations
             WHERE localized_manual = TRUE
               AND localized_names IS NOT NULL
               AND country = $1
             LIMIT 1`,
            [country]
        );
        if (sibCountry.rows.length > 0) {
            const sibChain = sibCountry.rows[0].localized_names as LocalizedChain;
            if (sibChain.country) {
                chain.country = { ...chain.country, ...sibChain.country };
            }
        }
    }
}

// ─── Persist ────────────────────────────────────────────────────────────

async function persistChain(locationId: string, chain: LocalizedChain): Promise<void> {
    await pool.query(
        `UPDATE locations
         SET localized_names = $2,
             localized_at = NOW()
         WHERE id = $1`,
        [locationId, chain]
    );
}
