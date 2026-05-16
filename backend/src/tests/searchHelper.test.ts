import { describe, it, expect } from 'vitest';
import { deduplicateResults, isSelectableNominatimResult } from '../services/searchHelper';

describe('searchHelper', () => {
    describe('deduplicateResults', () => {
        it('returns empty array for empty input', () => {
            expect(deduplicateResults([])).toEqual([]);
        });

        it('returns same array when no duplicates', () => {
            const input = [
                { osmId: 1, osmType: 'relation', name: 'Tokyo' },
                { osmId: 2, osmType: 'relation', name: 'Osaka' },
            ];
            expect(deduplicateResults(input)).toEqual(input);
        });

        it('removes duplicates by osmId:osmType key', () => {
            const input = [
                { osmId: 1, osmType: 'relation', name: 'Tokyo', isLocal: true },
                { osmId: 1, osmType: 'relation', name: 'Tokyo', isLocal: false },
                { osmId: 2, osmType: 'relation', name: 'Osaka' },
            ];
            const result = deduplicateResults(input);
            expect(result).toHaveLength(2);
            expect(result[0].osmId).toBe(1);
            expect(result[1].osmId).toBe(2);
        });

        it('keeps first occurrence when duplicates exist', () => {
            const input = [
                { osmId: 1, osmType: 'relation', isLocal: true, source: 'local' },
                { osmId: 1, osmType: 'relation', isLocal: false, source: 'nominatim' },
            ];
            const result = deduplicateResults(input);
            expect(result).toHaveLength(1);
            expect(result[0].isLocal).toBe(true);
            expect(result[0].source).toBe('local');
        });

        it('treats same osmId with different osmType as different', () => {
            const input = [
                { osmId: 1, osmType: 'relation', name: 'Place A' },
                { osmId: 1, osmType: 'way', name: 'Place B' },
            ];
            const result = deduplicateResults(input);
            expect(result).toHaveLength(2);
        });

        it('handles numeric osmId correctly (no type coercion issues)', () => {
            const input = [
                { osmId: 123456789, osmType: 'relation' },
                { osmId: 123456789, osmType: 'relation' },
            ];
            const result = deduplicateResults(input);
            expect(result).toHaveLength(1);
        });

        it('preserves order of first occurrences', () => {
            const input = [
                { osmId: 3, osmType: 'relation', name: 'Third' },
                { osmId: 1, osmType: 'relation', name: 'First' },
                { osmId: 2, osmType: 'relation', name: 'Second' },
                { osmId: 1, osmType: 'relation', name: 'First Duplicate' },
            ];
            const result = deduplicateResults(input);
            expect(result).toHaveLength(3);
            expect(result[0].name).toBe('Third');
            expect(result[1].name).toBe('First');
            expect(result[2].name).toBe('Second');
        });
    });

    describe('isSelectableNominatimResult', () => {
        it('keeps place nodes such as localities', () => {
            expect(isSelectableNominatimResult({
                class: 'place',
                type: 'locality',
            })).toBe(true);
        });

        it('keeps administrative boundaries', () => {
            expect(isSelectableNominatimResult({
                class: 'boundary',
                type: 'administrative',
            })).toBe(true);
        });

        it('drops non-place features such as streams', () => {
            expect(isSelectableNominatimResult({
                class: 'waterway',
                type: 'stream',
            })).toBe(false);
        });

        it('drops malformed yes-type results', () => {
            expect(isSelectableNominatimResult({
                class: 'place',
                type: 'yes',
            })).toBe(false);
        });
    });

});
