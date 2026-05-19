import { describe, it, expect } from 'vitest'
import { computeAllTags } from '../lib/signalTags'

type TxInput = {
    isin: string
    publicationDate: string
    person: string
    volume: number
    price: number
    nature: string
    closelyAssociated: boolean
    currency: string
    totalValue: number
    position: string
}

const makeTx = (overrides: Partial<TxInput> = {}): TxInput => ({
    isin: 'SE0000000001',
    publicationDate: '15/01/2024',
    person: 'Alice Smith',
    volume: 1000,
    price: 100,
    nature: 'Acquisition',
    closelyAssociated: false,
    currency: 'SEK',
    totalValue: 100_000,
    position: 'Chief Executive Officer',
    ...overrides,
})

const key = (tx: TxInput) =>
    `${tx.isin}|${tx.publicationDate}|${tx.person}|${tx.volume}|${tx.price}`

describe('computeAllTags', () => {
    it('returns empty map for empty input', () => {
        expect(computeAllTags([])).toEqual(new Map())
    })

    it('does not tag disposals', () => {
        expect(computeAllTags([makeTx({ nature: 'Disposal' })])).toEqual(new Map())
    })

    it('does not tag closely associated persons', () => {
        const tx = makeTx({ closelyAssociated: true, totalValue: 15_000_000 })
        expect(computeAllTags([tx])).toEqual(new Map())
    })

    it('tags huge_single for SEK purchases >= 10M', () => {
        const tx = makeTx({ totalValue: 10_000_000, currency: 'SEK' })
        const result = computeAllTags([tx])
        expect(result.get(key(tx))).toContain('huge_single')
    })

    it('does not tag huge_single for non-SEK currencies', () => {
        const tx = makeTx({ totalValue: 10_000_000, currency: 'USD' })
        const result = computeAllTags([tx])
        expect(result.get(key(tx)) ?? []).not.toContain('huge_single')
    })

    it('does not tag huge_single below 10M threshold', () => {
        const tx = makeTx({ totalValue: 9_999_999, currency: 'SEK' })
        const result = computeAllTags([tx])
        expect(result.get(key(tx)) ?? []).not.toContain('huge_single')
    })

    it('tags chairman_warning for chairman position', () => {
        const tx = makeTx({ position: 'Chairman of the Board' })
        const result = computeAllTags([tx])
        expect(result.get(key(tx))).toContain('chairman_warning')
    })

    it('tags chairman_warning for Swedish styrelseordförande position', () => {
        const tx = makeTx({ position: 'Styrelseordförande' })
        const result = computeAllTags([tx])
        expect(result.get(key(tx))).toContain('chairman_warning')
    })

    it('tags cluster when 2+ insiders buy same isin within 14 days', () => {
        const tx1 = makeTx({ person: 'Alice', publicationDate: '10/01/2024' })
        const tx2 = makeTx({ person: 'Bob', publicationDate: '15/01/2024' })
        const result = computeAllTags([tx1, tx2])
        expect(result.get(key(tx2))).toContain('cluster')
    })

    it('does not tag cluster when insiders buy outside 14-day window', () => {
        const tx1 = makeTx({ person: 'Alice', publicationDate: '01/01/2024' })
        const tx2 = makeTx({ person: 'Bob', publicationDate: '20/01/2024' })
        const result = computeAllTags([tx1, tx2])
        expect(result.get(key(tx2)) ?? []).not.toContain('cluster')
    })

    it('does not tag cluster when same person buys multiple times', () => {
        const tx1 = makeTx({ person: 'Alice', publicationDate: '10/01/2024' })
        const tx2 = makeTx({ person: 'Alice', publicationDate: '15/01/2024' })
        const result = computeAllTags([tx1, tx2])
        expect(result.get(key(tx2)) ?? []).not.toContain('cluster')
    })

    it('does not tag cluster for closely associated persons', () => {
        const tx1 = makeTx({ person: 'Alice', publicationDate: '10/01/2024' })
        const tx2 = makeTx({ person: 'Bob', closelyAssociated: true, publicationDate: '15/01/2024' })
        const result = computeAllTags([tx1, tx2])
        // tx2 is closely associated — not included in cluster detection at all
        expect(result.get(key(tx2)) ?? []).not.toContain('cluster')
    })
})
