import { lookupIsin } from './isinLookup'

interface TxLike {
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

export interface SignalTag {
    id: string
    label: string
    emoji: string
    shortDescription: string
    detailDescription: string
    historicalWinRate: string
    warning?: string
}

export const SIGNAL_TAGS: SignalTag[] = [
    {
        id: 'large_cfo',
        label: 'Large Cap CFO Buy',
        emoji: '🔍',
        shortDescription: 'Large Cap CFO cash purchase from secondary market',
        detailDescription: 'In a 9-year backtest (2017–2026), Large Cap CFO secondary-market cash buys achieved a 79.8% win rate reaching +8% within 90 days. This is the strongest alpha subset identified in the research.',
        historicalWinRate: '79.8% (n=99, +8% target, 90 days)',
    },
    {
        id: 'huge_single',
        label: 'Huge Single Buy',
        emoji: '💰',
        shortDescription: 'Single insider purchase > 10M SEK',
        detailDescription: 'A single transaction above 10M SEK is a genuinely rare insider commitment. Backtest shows 65.4% win rate reaching +10%, with an average final return of +7.8%.',
        historicalWinRate: '65.4% (n=78, +10% target)',
    },
    {
        id: 'cluster',
        label: 'Cluster Buy',
        emoji: '⚠️',
        shortDescription: '≥2 insiders buying same stock within 14 days',
        detailDescription: 'Two or more insiders buying the same stock within a 14-day window. The research found no incremental alpha from cluster size alone after controlling for trade size — it is a pattern to watch, not a strong standalone buy signal.',
        historicalWinRate: '~56.8% (base signal)',
        warning: 'Activity indicator only — not an alpha subset identified in research',
    },
    {
        id: 'chairman_warning',
        label: 'Chairman Buy',
        emoji: '📉',
        shortDescription: 'Chairman purchase (historically inverse signal)',
        detailDescription: 'Chairman buys showed the worst performance in 9 years of backtesting (final return -3.94% to -6.51%). Likely causes: ceremonial buying or large-shareholder rebalancing with no informational edge. Displayed for transparency — not a buy recommendation.',
        historicalWinRate: 'Negative alpha (final return -3.94%)',
        warning: 'Historically an inverse signal — treat with caution',
    },
]

function ddmmyyyyToMs(dateStr: string): number {
    if (!dateStr) return 0
    const parts = dateStr.split('/')
    if (parts.length !== 3) return 0
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime()
}

function makeTxKey(tx: TxLike): string {
    return `${tx.isin}|${tx.publicationDate}|${tx.person}|${tx.volume}|${tx.price}`
}

function precomputeClusterKeys(allTxs: TxLike[]): Set<string> {
    const flagged = new Set<string>()
    const byIsin = new Map<string, TxLike[]>()

    for (const tx of allTxs) {
        if (!tx.nature.includes('Acquisition') || tx.closelyAssociated) continue
        if (!byIsin.has(tx.isin)) byIsin.set(tx.isin, [])
        byIsin.get(tx.isin)!.push(tx)
    }

    for (const txs of byIsin.values()) {
        txs.sort((a, b) => ddmmyyyyToMs(a.publicationDate) - ddmmyyyyToMs(b.publicationDate))

        for (let i = 0; i < txs.length; i++) {
            const txTime = ddmmyyyyToMs(txs[i].publicationDate)
            const windowStart = txTime - 14 * 86400 * 1000
            const persons = new Set<string>()

            for (let j = i; j >= 0; j--) {
                if (ddmmyyyyToMs(txs[j].publicationDate) < windowStart) break
                persons.add(txs[j].person)
            }

            if (persons.size >= 2) {
                flagged.add(makeTxKey(txs[i]))
            }
        }
    }

    return flagged
}

export function computeAllTags(allTxs: TxLike[]): Map<string, string[]> {
    const clusterKeys = precomputeClusterKeys(allTxs)
    const result = new Map<string, string[]>()

    for (const tx of allTxs) {
        if (!tx.nature.includes('Acquisition') || tx.closelyAssociated) continue

        const tags: string[] = []
        const info = lookupIsin(tx.isin)
        const pos = (tx.position || '').toLowerCase()

        if (
            info.cap_tier === 'Large' &&
            (pos.includes('cfo') || pos.includes('chief financial') ||
                pos.includes('finansdirektör') || pos.includes('finanschef'))
        ) {
            tags.push('large_cfo')
        }

        if (tx.currency === 'SEK' && tx.totalValue >= 10_000_000) {
            tags.push('huge_single')
        }

        if (clusterKeys.has(makeTxKey(tx))) {
            tags.push('cluster')
        }

        if (pos.includes('chair') || pos.includes('styrelseordförande')) {
            tags.push('chairman_warning')
        }

        if (tags.length > 0) {
            result.set(makeTxKey(tx), tags)
        }
    }

    return result
}
