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

export const loadTransactions = async (): Promise<Transaction[]> => {
    try {
        const [txResponse] = await Promise.all([
            fetch('/data/transactions.json'),
            loadIsinData(),
        ]);

        if (!txResponse.ok) throw new Error('Transaction data not found');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (await txResponse.json()) as any[];

        const enriched: Transaction[] = data.map((t) => {
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
