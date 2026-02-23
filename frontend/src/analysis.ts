import { Transaction } from './types';

// ─── Signal Grading ─────────────────────────────────────────────

export type SignalGrade = 'junk' | 'watch' | 'conviction' | 'table-pounding' | 'none';

export interface SignalInfo {
    grade: SignalGrade;
    label: string;
    icon: string;
    colorClass: string;
}

const THRESHOLDS = {
    JUNK_MAX: 200_000,
    WATCH_MAX: 500_000,
    TABLE_POUNDING_MIN: 1_000_000,
};

export function getSignalInfo(t: Transaction): SignalInfo {
    // Only grade Acquisitions
    if (!t.nature.includes('Acquisition')) {
        return { grade: 'none', label: '', icon: '', colorClass: '' };
    }

    const value = t.totalValue || 0;

    if (value >= THRESHOLDS.TABLE_POUNDING_MIN) {
        return {
            grade: 'table-pounding',
            label: 'Table-Pounding',
            icon: '🔥',
            colorClass: 'bg-red-500/15 text-red-400 border border-red-500/30',
        };
    }
    if (value >= THRESHOLDS.WATCH_MAX) {
        return {
            grade: 'conviction',
            label: 'Conviction',
            icon: '💎',
            colorClass: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
        };
    }
    if (value >= THRESHOLDS.JUNK_MAX) {
        return {
            grade: 'watch',
            label: 'Watch',
            icon: '👀',
            colorClass: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
        };
    }

    return {
        grade: 'junk',
        label: 'Token',
        icon: '🧹',
        colorClass: 'bg-zinc-500/10 text-zinc-500',
    };
}

// ─── Cluster Detection ──────────────────────────────────────────

export interface ClusterMember {
    person: string;
    position: string;
    totalValue: number;
    transactionCount: number;
    currency: string;
}

export interface InsiderCluster {
    issuer: string;
    members: ClusterMember[];
    combinedValue: number;
    dateRange: string;
    transactionCount: number;
    marketSegment?: string;
}

function parseDate(dateStr: string): Date | null {
    // Format: DD/MM/YYYY
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
}

function daysBetween(d1: Date, d2: Date): number {
    return Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24);
}

export function detectClusters(transactions: Transaction[], windowDays: number = 30): InsiderCluster[] {
    // Only look at Acquisitions
    const acquisitions = transactions.filter(t => t.nature.includes('Acquisition'));

    // Group by issuer
    const byIssuer = new Map<string, Transaction[]>();
    for (const t of acquisitions) {
        const key = t.issuer;
        if (!byIssuer.has(key)) byIssuer.set(key, []);
        byIssuer.get(key)!.push(t);
    }

    const clusters: InsiderCluster[] = [];

    for (const [issuer, txns] of byIssuer) {
        // Sort by transaction date
        const sorted = txns
            .map(t => ({ ...t, _parsed: parseDate(t.transactionDate) }))
            .filter(t => t._parsed !== null)
            .sort((a, b) => b._parsed!.getTime() - a._parsed!.getTime());

        if (sorted.length < 2) continue;

        // Find unique persons who bought within the window (from most recent date)
        const mostRecent = sorted[0]._parsed!;
        const inWindow = sorted.filter(t => daysBetween(t._parsed!, mostRecent) <= windowDays);

        // Group by person within the window
        const personMap = new Map<string, { position: string; totalValue: number; count: number; currency: string }>();
        for (const t of inWindow) {
            const existing = personMap.get(t.person);
            if (existing) {
                existing.totalValue += t.totalValue || 0;
                existing.count += 1;
            } else {
                personMap.set(t.person, {
                    position: t.position,
                    totalValue: t.totalValue || 0,
                    count: 1,
                    currency: t.currency,
                });
            }
        }

        // Need 2+ distinct persons for a cluster
        if (personMap.size < 2) continue;

        const members: ClusterMember[] = [];
        let combinedValue = 0;
        for (const [person, info] of personMap) {
            members.push({
                person,
                position: info.position,
                totalValue: info.totalValue,
                transactionCount: info.count,
                currency: info.currency,
            });
            combinedValue += info.totalValue;
        }

        // Sort members by value descending
        members.sort((a, b) => b.totalValue - a.totalValue);

        // Date range
        const dates = inWindow.map(t => t._parsed!).sort((a, b) => a.getTime() - b.getTime());
        const earliest = dates[0];
        const latest = dates[dates.length - 1];
        const fmt = (d: Date) => d.toISOString().split('T')[0];
        const dateRange = fmt(earliest) === fmt(latest)
            ? fmt(earliest)
            : `${fmt(earliest)} → ${fmt(latest)}`;

        clusters.push({
            issuer,
            members,
            combinedValue,
            dateRange,
            transactionCount: inWindow.length,
            marketSegment: inWindow[0].marketSegment,
        });
    }

    // Sort clusters by combined value descending
    clusters.sort((a, b) => b.combinedValue - a.combinedValue);

    return clusters;
}
