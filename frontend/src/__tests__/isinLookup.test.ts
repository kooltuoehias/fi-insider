import { describe, it, expect } from 'vitest'
import { getCapTier, lookupIsin } from '../lib/isinLookup'

describe('getCapTier', () => {
    it('returns Large for market cap >= 11B SEK', () => {
        expect(getCapTier(11_000_000_000)).toBe('Large')
        expect(getCapTier(50_000_000_000)).toBe('Large')
    })

    it('returns Mid for market cap in [1.7B, 11B)', () => {
        expect(getCapTier(1_700_000_000)).toBe('Mid')
        expect(getCapTier(5_000_000_000)).toBe('Mid')
        expect(getCapTier(10_999_999_999)).toBe('Mid')
    })

    it('returns Small for market cap < 1.7B SEK', () => {
        expect(getCapTier(1_699_999_999)).toBe('Small')
        expect(getCapTier(0)).toBe('Small')
    })

    it('returns unknown for null or undefined', () => {
        expect(getCapTier(null)).toBe('unknown')
        expect(getCapTier(undefined as unknown as null)).toBe('unknown')
    })
})

describe('lookupIsin', () => {
    it('returns unknown cap tier when isin data is not loaded', () => {
        const result = lookupIsin('SE0000000001')
        expect(result.cap_tier).toBe('unknown')
    })

    it('returns null ticker and urls when isin data is not loaded', () => {
        const result = lookupIsin('SE0000000001')
        expect(result.yahoo_ticker).toBeNull()
        expect(result.yahoo_url).toBeNull()
        expect(result.avanza_url).toBeNull()
    })

    it('echoes back the isin', () => {
        expect(lookupIsin('SE123').isin).toBe('SE123')
        expect(lookupIsin('').isin).toBe('')
    })
})
