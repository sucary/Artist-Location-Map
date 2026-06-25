import { describe, expect, it } from 'vitest';
import { VenueSearchQuerySchema } from '../schemas/venueValidation';

// Guards against z.coerce.boolean() treating the string "false" as truthy.

describe('VenueSearchQuerySchema nativeName parsing', () => {
    it('parses "false" as false', () => {
        const parsed = VenueSearchQuerySchema.parse({ q: 'Tokyo Dome', nativeName: 'false' });
        expect(parsed.nativeName).toBe(false);
    });

    it('parses "0" as false', () => {
        const parsed = VenueSearchQuerySchema.parse({ q: 'Tokyo Dome', nativeName: '0' });
        expect(parsed.nativeName).toBe(false);
    });

    it('parses "true" as true', () => {
        const parsed = VenueSearchQuerySchema.parse({ q: 'Tokyo Dome', nativeName: 'true' });
        expect(parsed.nativeName).toBe(true);
    });

    it('parses "1" as true', () => {
        const parsed = VenueSearchQuerySchema.parse({ q: 'Tokyo Dome', nativeName: '1' });
        expect(parsed.nativeName).toBe(true);
    });

    it('leaves nativeName undefined when omitted', () => {
        const parsed = VenueSearchQuerySchema.parse({ q: 'Tokyo Dome' });
        expect(parsed.nativeName).toBeUndefined();
    });
});
