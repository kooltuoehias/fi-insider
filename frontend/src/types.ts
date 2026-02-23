import { SignalGrade, getSignalInfo } from './analysis';

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
    signalGrade?: SignalGrade;
}

export const loadTransactions = async (): Promise<Transaction[]> => {
    try {
        const [txResponse, lcResponse, mcResponse] = await Promise.allSettled([
            fetch('/data/transactions.json'),
            fetch('/data/lc.log'),
            fetch('/data/mc.log')
        ]);

        if (txResponse.status !== 'fulfilled' || !txResponse.value.ok) {
            throw new Error('Transaction data not found');
        }

        const data = await txResponse.value.json();

        // Parse log files into arrays of strings
        let largeCapList: string[] = [];
        let midCapList: string[] = [];

        if (lcResponse.status === 'fulfilled' && lcResponse.value.ok) {
            const lcText = await lcResponse.value.text();
            largeCapList = lcText.split('\n').map(s => s.trim()).filter(s => s.length > 0);
        }
        if (mcResponse.status === 'fulfilled' && mcResponse.value.ok) {
            const mcText = await mcResponse.value.text();
            midCapList = mcText.split('\n').map(s => s.trim()).filter(s => s.length > 0);
        }

        const stringSimilarity = await import('string-similarity');
        const memoizedSegments = new Map<string, string>();

        const enriched: Transaction[] = data.map((t: any) => {
            // 1. Check if we've already calculated the segment for this exact issuer name
            if (memoizedSegments.has(t.issuer)) {
                return {
                    ...t,
                    totalValue: t.volume * t.price,
                    marketSegment: memoizedSegments.get(t.issuer)
                };
            }

            let marketSegment = "Unknown";
            let bestScore = 0;

            // 2. Fast Path: Exact Matches
            if (largeCapList.includes(t.issuer)) {
                marketSegment = "Large Cap";
                memoizedSegments.set(t.issuer, marketSegment);
                return { ...t, totalValue: t.volume * t.price, marketSegment };
            }

            if (midCapList.includes(t.issuer)) {
                marketSegment = "Mid Cap";
                memoizedSegments.set(t.issuer, marketSegment);
                return { ...t, totalValue: t.volume * t.price, marketSegment };
            }

            // 3. Slow Path: Fuzzy Matching
            let usedFuzzy = false;

            // Test against Large Cap (threshold 0.6)
            if (largeCapList.length > 0) {
                const matchDetails = stringSimilarity.findBestMatch(t.issuer, largeCapList);
                if (matchDetails.bestMatch.rating > bestScore && matchDetails.bestMatch.rating >= 0.6) {
                    bestScore = matchDetails.bestMatch.rating;
                    marketSegment = "Large Cap";
                    usedFuzzy = true;
                }
            }

            // Test against Mid Cap (threshold 0.6)
            if (midCapList.length > 0) {
                const matchDetails = stringSimilarity.findBestMatch(t.issuer, midCapList);
                // If it beats Large Cap's score, it belongs in Mid Cap
                if (matchDetails.bestMatch.rating > bestScore && matchDetails.bestMatch.rating >= 0.6) {
                    bestScore = matchDetails.bestMatch.rating;
                    marketSegment = "Mid Cap";
                    usedFuzzy = true;
                }
            }

            if (usedFuzzy) {
                console.log(`[Fuzzy Match Used] Mapped '${t.issuer}' to '${marketSegment}'`);
            }

            // Save the result so we never have to run findBestMatch for this issuer again
            memoizedSegments.set(t.issuer, marketSegment);

            return {
                ...t,
                totalValue: t.volume * t.price,
                marketSegment
            };
        });

        // Assign signal grades
        for (const t of enriched) {
            t.signalGrade = getSignalInfo(t).grade;
        }

        return enriched;
    } catch (e) {
        console.warn("Could not load transactions, using empty list or fallback.", e);
        return [];
    }
};
