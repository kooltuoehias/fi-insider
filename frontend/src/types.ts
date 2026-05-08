import { SignalGrade, getSignalInfo } from './analysis';
import { loadIsinData, lookupIsin, CapTier } from './lib/isinLookup';
import { computeAllTags } from './lib/signalTags';

export interface Transaction {
    publicationDate: string;
    issuer: string;
    person: string;
    position: string;
    closelyAssociated: boolean;
    nature: string;
    instrument: string;
    instrumentType: string;
    isin: string;
    transactionDate: string;
    volume: number;
    unit: string;
    price: number;
    currency: string;
    status: string;
    details: string;
    totalValue: number;
    marketSegment?: string;
    capTier?: CapTier;
    signalGrade?: SignalGrade;
    tags: string[];
    yahooTicker: string | null;
    yahooUrl: string | null;
    avanzaUrl: string | null;
}

function makeTxKey(t: Pick<Transaction, 'isin' | 'publicationDate' | 'person' | 'volume' | 'price'>): string {
    return `${t.isin}|${t.publicationDate}|${t.person}|${t.volume}|${t.price}`;
}

function ddmmyyyyToMs(d: string): number {
    const [dd, mm, yy] = (d || '').split('/')
    return new Date(+yy, +mm - 1, +dd).getTime()
}

const START_YEAR = 2016

export const loadTransactions = async (): Promise<Transaction[]> => {
    try {
        const currentYear = new Date().getFullYear()
        const years = Array.from({ length: currentYear - START_YEAR + 1 }, (_, i) => START_YEAR + i)

        const [yearResults] = await Promise.all([
            Promise.allSettled(years.map(y => fetch(`/data/transactions_${y}.json`))),
            loadIsinData(),
        ])

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allData: any[] = []
        for (const result of yearResults) {
            if (result.status === 'fulfilled' && result.value.ok) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const yearData = await result.value.json() as any[]
                allData.push(...yearData)
            }
        }

        if (allData.length === 0) throw new Error('No transaction data found')

        // Sort newest first
        allData.sort((a, b) => ddmmyyyyToMs(b.publicationDate) - ddmmyyyyToMs(a.publicationDate))

        const enriched: Transaction[] = allData.map((t) => {
            const info = lookupIsin(t.isin || '');
            let marketSegment: string;
            switch (info.cap_tier) {
                case 'Large': marketSegment = 'Large Cap'; break;
                case 'Mid':   marketSegment = 'Mid Cap';   break;
                case 'Small': marketSegment = 'Small Cap'; break;
                default:      marketSegment = 'Unknown';
            }
            return {
                ...t,
                totalValue: (t.volume || 0) * (t.price || 0),
                marketSegment,
                capTier: info.cap_tier,
                yahooTicker: info.yahoo_ticker,
                yahooUrl: info.yahoo_url,
                avanzaUrl: info.avanza_url,
                tags: [],
            };
        });

        for (const t of enriched) {
            t.signalGrade = getSignalInfo(t).grade;
        }

        const tagMap = computeAllTags(enriched);
        for (const t of enriched) {
            t.tags = tagMap.get(makeTxKey(t)) || [];
        }

        return enriched;
    } catch (e) {
        console.warn('Could not load transactions.', e);
        return [];
    }
};
