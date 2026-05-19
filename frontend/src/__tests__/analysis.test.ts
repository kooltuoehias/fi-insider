import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getSignalInfo, detectClusters, detectCEOCFOBuys } from '../analysis'
import type { Transaction } from '../types'

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
    publicationDate: '15/01/2024',
    issuer: 'Acme AB',
    person: 'Alice Smith',
    position: 'Chief Executive Officer',
    closelyAssociated: false,
    nature: 'Acquisition',
    instrument: 'Share',
    instrumentType: 'Share',
    isin: 'SE0000000001',
    transactionDate: '15/01/2024',
    volume: 1000,
    unit: 'Share',
    price: 100,
    currency: 'SEK',
    status: 'current',
    details: '',
    totalValue: 100_000,
    marketSegment: 'Unknown',
    tags: [],
    yahooTicker: null,
    yahooUrl: null,
    avanzaUrl: null,
    ...overrides,
})

describe('getSignalInfo', () => {
    it('returns none for non-acquisitions', () => {
        expect(getSignalInfo(makeTx({ nature: 'Disposal' })).grade).toBe('none')
        expect(getSignalInfo(makeTx({ nature: 'Gift' })).grade).toBe('none')
    })

    it('returns table-pounding for value >= 1,000,000', () => {
        expect(getSignalInfo(makeTx({ totalValue: 1_000_000 })).grade).toBe('table-pounding')
        expect(getSignalInfo(makeTx({ totalValue: 5_000_000 })).grade).toBe('table-pounding')
    })

    it('returns conviction for value in [500k, 1M)', () => {
        expect(getSignalInfo(makeTx({ totalValue: 500_000 })).grade).toBe('conviction')
        expect(getSignalInfo(makeTx({ totalValue: 999_999 })).grade).toBe('conviction')
    })

    it('returns watch for value in [200k, 500k)', () => {
        expect(getSignalInfo(makeTx({ totalValue: 200_000 })).grade).toBe('watch')
        expect(getSignalInfo(makeTx({ totalValue: 499_999 })).grade).toBe('watch')
    })

    it('returns junk for value < 200,000', () => {
        expect(getSignalInfo(makeTx({ totalValue: 199_999 })).grade).toBe('junk')
        expect(getSignalInfo(makeTx({ totalValue: 0 })).grade).toBe('junk')
    })

    it('includes label and icon for acquisitions', () => {
        const info = getSignalInfo(makeTx({ totalValue: 1_000_000 }))
        expect(info.label).toBeTruthy()
        expect(info.icon).toBeTruthy()
    })

    it('returns empty label and icon for non-acquisitions', () => {
        const info = getSignalInfo(makeTx({ nature: 'Disposal' }))
        expect(info.label).toBe('')
        expect(info.icon).toBe('')
    })
})

describe('detectClusters', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2024-01-20'))
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('returns empty for empty input', () => {
        expect(detectClusters([])).toEqual([])
    })

    it('returns empty when only one insider buys', () => {
        const txns = [
            makeTx({ person: 'Alice', transactionDate: '15/01/2024' }),
            makeTx({ person: 'Alice', transactionDate: '16/01/2024' }),
        ]
        expect(detectClusters(txns)).toHaveLength(0)
    })

    it('detects cluster when 2+ distinct insiders buy within window', () => {
        const txns = [
            makeTx({ person: 'Alice', transactionDate: '15/01/2024' }),
            makeTx({ person: 'Bob', transactionDate: '16/01/2024' }),
        ]
        const result = detectClusters(txns, 30)
        expect(result).toHaveLength(1)
        expect(result[0].members).toHaveLength(2)
        expect(result[0].issuer).toBe('Acme AB')
    })

    it('does not detect cluster when buys are outside the window', () => {
        const txns = [
            makeTx({ person: 'Alice', transactionDate: '01/11/2023' }),
            makeTx({ person: 'Bob', transactionDate: '01/11/2023' }),
        ]
        expect(detectClusters(txns, 30)).toHaveLength(0)
    })

    it('ignores non-acquisitions when detecting clusters', () => {
        const txns = [
            makeTx({ person: 'Alice', nature: 'Disposal', transactionDate: '15/01/2024' }),
            makeTx({ person: 'Bob', nature: 'Disposal', transactionDate: '16/01/2024' }),
        ]
        expect(detectClusters(txns)).toHaveLength(0)
    })

    it('groups by isin not issuer name', () => {
        const txns = [
            makeTx({ person: 'Alice', isin: 'SE001', issuer: 'Acme AB', transactionDate: '15/01/2024' }),
            makeTx({ person: 'Bob', isin: 'SE001', issuer: 'Acme AB (publ)', transactionDate: '16/01/2024' }),
        ]
        const result = detectClusters(txns)
        expect(result).toHaveLength(1)
    })

    it('sorts clusters by combined value descending', () => {
        const txns = [
            makeTx({ person: 'Alice', isin: 'SE001', issuer: 'Small Co', totalValue: 100_000, transactionDate: '15/01/2024' }),
            makeTx({ person: 'Bob', isin: 'SE001', issuer: 'Small Co', totalValue: 100_000, transactionDate: '15/01/2024' }),
            makeTx({ person: 'Charlie', isin: 'SE002', issuer: 'Big Co', totalValue: 1_000_000, transactionDate: '15/01/2024' }),
            makeTx({ person: 'Dave', isin: 'SE002', issuer: 'Big Co', totalValue: 1_000_000, transactionDate: '15/01/2024' }),
        ]
        const result = detectClusters(txns)
        expect(result[0].issuer).toBe('Big Co')
        expect(result[0].combinedValue).toBe(2_000_000)
    })
})

describe('detectCEOCFOBuys', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2024-01-20'))
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('returns empty for empty input', () => {
        expect(detectCEOCFOBuys([])).toEqual([])
    })

    it('detects alert when CEO and CFO are different people buying within window', () => {
        const txns = [
            makeTx({ person: 'Alice', position: 'Chief Executive Officer', transactionDate: '15/01/2024' }),
            makeTx({ person: 'Bob', position: 'Chief Financial Officer', transactionDate: '16/01/2024' }),
        ]
        const result = detectCEOCFOBuys(txns, 90)
        expect(result).toHaveLength(1)
        expect(result[0].ceo.person).toBe('Alice')
        expect(result[0].cfo.person).toBe('Bob')
    })

    it('does not alert when CEO and CFO are the same person', () => {
        const txns = [
            makeTx({ person: 'Alice', position: 'Chief Executive Officer', transactionDate: '15/01/2024' }),
            makeTx({ person: 'Alice', position: 'Chief Financial Officer', transactionDate: '16/01/2024' }),
        ]
        expect(detectCEOCFOBuys(txns, 90)).toHaveLength(0)
    })

    it('does not alert with only CEO and no CFO', () => {
        const txns = [
            makeTx({ person: 'Alice', position: 'Chief Executive Officer', transactionDate: '15/01/2024' }),
            makeTx({ person: 'Bob', position: 'Board Member', transactionDate: '16/01/2024' }),
        ]
        expect(detectCEOCFOBuys(txns, 90)).toHaveLength(0)
    })

    it('ignores transactions outside the window', () => {
        const txns = [
            makeTx({ person: 'Alice', position: 'Chief Executive Officer', transactionDate: '01/01/2023' }),
            makeTx({ person: 'Bob', position: 'Chief Financial Officer', transactionDate: '01/01/2023' }),
        ]
        expect(detectCEOCFOBuys(txns, 90)).toHaveLength(0)
    })

    it('ignores non-acquisitions', () => {
        const txns = [
            makeTx({ person: 'Alice', position: 'Chief Executive Officer', nature: 'Disposal', transactionDate: '15/01/2024' }),
            makeTx({ person: 'Bob', position: 'Chief Financial Officer', nature: 'Disposal', transactionDate: '16/01/2024' }),
        ]
        expect(detectCEOCFOBuys(txns, 90)).toHaveLength(0)
    })

    it('sorts alerts by combined value descending', () => {
        const txns = [
            makeTx({ person: 'CEO1', position: 'Chief Executive Officer', isin: 'SE001', issuer: 'Small Co', totalValue: 100_000, transactionDate: '15/01/2024' }),
            makeTx({ person: 'CFO1', position: 'Chief Financial Officer', isin: 'SE001', issuer: 'Small Co', totalValue: 100_000, transactionDate: '15/01/2024' }),
            makeTx({ person: 'CEO2', position: 'Chief Executive Officer', isin: 'SE002', issuer: 'Big Co', totalValue: 5_000_000, transactionDate: '15/01/2024' }),
            makeTx({ person: 'CFO2', position: 'Chief Financial Officer', isin: 'SE002', issuer: 'Big Co', totalValue: 5_000_000, transactionDate: '15/01/2024' }),
        ]
        const result = detectCEOCFOBuys(txns, 90)
        expect(result[0].issuer).toBe('Big Co')
    })
})
