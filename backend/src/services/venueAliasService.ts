import path from 'path';
import { pinyin } from 'pinyin-pro';
import * as OpenCC from 'opencc-js';
import kuromoji, { type IpadicFeatures, type Tokenizer } from 'kuromoji';
import { toHiragana, toKatakana, toRomaji } from 'wanakana';

const cnToTw = OpenCC.Converter({ from: 'cn', to: 'tw' });
const twToCn = OpenCC.Converter({ from: 'tw', to: 'cn' });
const hanPattern = /[\u3400-\u9fff]/;
const kanaPattern = /[\u3040-\u30ff]/;
const latinPattern = /[A-Za-z]/;
const kuromojiDictionaryPath = path.join(path.dirname(require.resolve('kuromoji/package.json')), 'dict');

let tokenizerPromise: Promise<Tokenizer<IpadicFeatures> | null> | null = null;

type AliasLanguageScope = {
    country?: string | null;
    countryCode?: string | null;
};

const chineseCountryCodes = new Set(['cn', 'tw', 'hk', 'mo']);
const japaneseCountryValues = new Set(['japan', '日本', 'jp']);

function isJapaneseScope(scope: AliasLanguageScope): boolean {
    const countryCode = scope.countryCode?.toLowerCase();
    const country = scope.country?.trim().toLowerCase();
    return countryCode === 'jp' || Boolean(country && japaneseCountryValues.has(country));
}

function isChineseScope(scope: AliasLanguageScope): boolean {
    const countryCode = scope.countryCode?.toLowerCase();
    return Boolean(countryCode && chineseCountryCodes.has(countryCode));
}

function addAlias(aliases: Set<string>, value?: string | null) {
    const normalized = value?.normalize('NFKC').trim();
    if (!normalized) return;
    aliases.add(normalized);
    aliases.add(normalized.toLowerCase());
}

function addPinyinAliases(aliases: Set<string>, value: string) {
    if (!hanPattern.test(value)) return;

    const simplified = twToCn(value);
    const traditional = cnToTw(value);
    for (const variant of [value, simplified, traditional]) {
        addAlias(aliases, variant);
        const spaced = pinyin(variant, { toneType: 'none' });
        addAlias(aliases, spaced);
        addAlias(aliases, spaced.replace(/\s+/g, ''));
    }
}

function addKanaAliases(aliases: Set<string>, value: string) {
    if (!kanaPattern.test(value)) return;

    // Kana aliases never infer kanji
    const hiragana = toHiragana(value, { passRomaji: true });
    const katakana = toKatakana(value, { passRomaji: true });
    addAlias(aliases, hiragana);
    addAlias(aliases, katakana);
    addAlias(aliases, toRomaji(hiragana));
}

async function getJapaneseTokenizer(): Promise<Tokenizer<IpadicFeatures> | null> {
    if (!tokenizerPromise) {
        tokenizerPromise = new Promise((resolve) => {
            kuromoji.builder({ dicPath: kuromojiDictionaryPath }).build((error, tokenizer) => {
                resolve(error ? null : tokenizer);
            });
        });
    }

    return tokenizerPromise;
}

async function addJapaneseReadingAliases(aliases: Set<string>, value: string) {
    if (!hanPattern.test(value) && !kanaPattern.test(value)) return;

    const tokenizer = await getJapaneseTokenizer();
    if (!tokenizer) return;

    const readings = tokenizer.tokenize(value)
        .map((token) => token.reading || token.pronunciation || '')
        .filter(Boolean)
        .join('');
    if (!readings) return;

    const hiragana = toHiragana(readings);
    const katakana = toKatakana(readings);
    addAlias(aliases, hiragana);
    addAlias(aliases, katakana);
    addAlias(aliases, toRomaji(hiragana));
}

export async function generateVenueSearchAliases(
    values: Array<string | null | undefined>,
    scope: AliasLanguageScope = {}
): Promise<string[]> {
    const aliases = new Set<string>();
    const japaneseScope = isJapaneseScope(scope);
    const chineseScope = isChineseScope(scope);
    const allowJapanese = japaneseScope || !chineseScope;

    for (const value of values) {
        addAlias(aliases, value);
        const normalized = value?.normalize('NFKC').trim();
        if (!normalized) continue;

        addPinyinAliases(aliases, normalized);
        if (!allowJapanese && !kanaPattern.test(normalized)) continue;

        addKanaAliases(aliases, normalized);
        if (allowJapanese && (hanPattern.test(normalized) || kanaPattern.test(normalized) || latinPattern.test(normalized))) {
            await addJapaneseReadingAliases(aliases, normalized);
        }
    }

    return [...aliases].filter((alias) => alias.length <= 255);
}
