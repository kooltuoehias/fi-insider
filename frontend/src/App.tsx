import React, { useEffect, useState } from 'react';
import { Transaction, loadTransactions } from './types';
import { getSignalInfo, detectClusters, InsiderCluster, detectCEOCFOBuys, CEOCFOAlert } from './analysis';
import { CapTier } from './lib/isinLookup';
import { SIGNAL_TAGS, SignalTag } from './lib/signalTags';
import { Search, ArrowUpDown, Download, AlertTriangle, Users, ExternalLink, BarChart2 } from 'lucide-react';

type View = 'dashboard' | 'signals' | 'research';

const TAG_MAP = Object.fromEntries(SIGNAL_TAGS.map(t => [t.id, t]));

function App() {
    const [data, setData] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentView, setCurrentView] = useState<View>('dashboard');
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Transaction; direction: 'asc' | 'desc' } | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [signalFilter, setSignalFilter] = useState<string | null>(null);
    const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
    const itemsPerPage = 100;

    useEffect(() => {
        loadTransactions().then((transactions) => {
            setData(transactions);
            setLoading(false);
        });
    }, []);

    const clusters = React.useMemo(() => detectClusters(data, 30), [data]);
    const ceoCfoAlerts = React.useMemo(() => detectCEOCFOBuys(data, 90), [data]);

    const signalCounts = React.useMemo(() => {
        const counts = { 'table-pounding': 0, conviction: 0, watch: 0, junk: 0 };
        data.forEach(t => {
            if (t.signalGrade && t.signalGrade in counts) {
                counts[t.signalGrade as keyof typeof counts]++;
            }
        });
        return counts;
    }, [data]);

    const tagCounts = React.useMemo(() => {
        const counts: Record<string, number> = {};
        for (const tx of data) {
            for (const tag of (tx.tags || [])) {
                counts[tag] = (counts[tag] || 0) + 1;
            }
        }
        return counts;
    }, [data]);

    const toggleTagFilter = (tagId: string) => {
        setActiveTagFilters(prev =>
            prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
        );
        setCurrentPage(1);
    };

    const sortedData = React.useMemo(() => {
        let items = [...data];

        if (filter) {
            const lowerFilter = filter.toLowerCase();
            items = items.filter(item =>
                item.issuer.toLowerCase().includes(lowerFilter) ||
                item.person.toLowerCase().includes(lowerFilter) ||
                item.instrument.toLowerCase().includes(lowerFilter) ||
                (item.position && item.position.toLowerCase().includes(lowerFilter))
            );
        }

        if (signalFilter) {
            items = items.filter(item => item.signalGrade === signalFilter);
        }

        if (activeTagFilters.length > 0) {
            items = items.filter(item =>
                item.tags?.some(tag => activeTagFilters.includes(tag))
            );
        }

        if (sortConfig !== null) {
            items.sort((a, b) => {
                const valA = a[sortConfig.key] ?? '';
                const valB = b[sortConfig.key] ?? '';
                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [data, sortConfig, filter, signalFilter, activeTagFilters]);

    const requestSort = (key: keyof Transaction) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const downloadCSV = () => {
        if (sortedData.length === 0) return;
        const headers = Object.keys(sortedData[0]).join(',');
        const csvContent = [
            headers,
            ...sortedData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'transactions.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const totalPages = Math.ceil(sortedData.length / itemsPerPage);
    const paginatedData = sortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    if (loading) {
        return <div className="min-h-screen bg-background text-foreground flex items-center justify-center">Loading Data...</div>;
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-8 font-sans">
            {/* Header */}
            <header className="mb-8 border-b border-border pb-4">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-primary">Swedish Insider Dashboard</h1>
                        <p className="text-muted-foreground mt-1">Analyzing {data.length.toLocaleString()} transactions</p>
                    </div>
                    {currentView === 'dashboard' && (
                        <div className="flex gap-4">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder="Search issuer, person..."
                                    className="pl-9 h-10 w-[300px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    value={filter}
                                    onChange={(e) => { setFilter(e.target.value); setCurrentPage(1); }}
                                />
                            </div>
                            <button
                                onClick={downloadCSV}
                                className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                            >
                                <Download className="mr-2 h-4 w-4" /> Export CSV
                            </button>
                        </div>
                    )}
                </div>
                <nav className="flex gap-1">
                    {(['dashboard', 'signals', 'research'] as View[]).map(view => (
                        <button
                            key={view}
                            onClick={() => setCurrentView(view)}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                                currentView === view
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {view === 'signals' ? 'Signal Tags' : view === 'research' ? 'Research' : 'Dashboard'}
                        </button>
                    ))}
                </nav>
            </header>

            {/* Views */}
            {currentView === 'signals' && <SignalsView onNavigate={setCurrentView} />}
            {currentView === 'research' && <ResearchView />}
            {currentView === 'dashboard' && (
                <>
                    {/* CEO + CFO Dual Buy Panel */}
                    {ceoCfoAlerts.length > 0 && (
                        <section className="mb-4">
                            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-card-foreground shadow-sm p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="text-xl">👑</span>
                                    <h3 className="text-lg font-semibold text-yellow-300">CEO + CFO Both Buying (90d)</h3>
                                    <span className="ml-auto text-xs text-muted-foreground">{ceoCfoAlerts.length} {ceoCfoAlerts.length === 1 ? 'company' : 'companies'}</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {ceoCfoAlerts.map((alert, idx) => (
                                        <CEOCFOCard key={idx} alert={alert} />
                                    ))}
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Signal Stats + Cluster Panel */}
                    <section className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Users className="h-5 w-5 text-amber-400" />
                                <h3 className="text-lg font-semibold">Insider Clusters (30d)</h3>
                            </div>
                            {clusters.length === 0 ? (
                                <p className="text-muted-foreground text-sm">No clusters detected in the last 30 days.</p>
                            ) : (
                                <div className="space-y-3 max-h-[240px] overflow-y-auto pr-2">
                                    {clusters.slice(0, 10).map((cluster, idx) => (
                                        <ClusterCard key={idx} cluster={cluster} />
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                            <div className="flex items-center gap-2 mb-4">
                                <AlertTriangle className="h-5 w-5 text-primary" />
                                <h3 className="text-lg font-semibold">Signal Breakdown</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <SignalStatButton icon="🔥" label="Table-Pounding" count={signalCounts['table-pounding']} colorClass="text-red-400" active={signalFilter === 'table-pounding'} onClick={() => { setSignalFilter(signalFilter === 'table-pounding' ? null : 'table-pounding'); setCurrentPage(1); }} />
                                <SignalStatButton icon="💎" label="Conviction" count={signalCounts.conviction} colorClass="text-emerald-400" active={signalFilter === 'conviction'} onClick={() => { setSignalFilter(signalFilter === 'conviction' ? null : 'conviction'); setCurrentPage(1); }} />
                                <SignalStatButton icon="👀" label="Watch" count={signalCounts.watch} colorClass="text-yellow-400" active={signalFilter === 'watch'} onClick={() => { setSignalFilter(signalFilter === 'watch' ? null : 'watch'); setCurrentPage(1); }} />
                                <SignalStatButton icon="🧹" label="Token" count={signalCounts.junk} colorClass="text-zinc-500" active={signalFilter === 'junk'} onClick={() => { setSignalFilter(signalFilter === 'junk' ? null : 'junk'); setCurrentPage(1); }} />
                            </div>
                            {signalFilter && (
                                <button onClick={() => { setSignalFilter(null); setCurrentPage(1); }} className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                    ✕ Clear filter
                                </button>
                            )}
                        </div>
                    </section>

                    {/* Research Signal Tag Filter Bar */}
                    <div className="mb-4 rounded-lg border border-border bg-card p-4">
                        <div className="flex flex-wrap gap-2 items-center mb-2">
                            <span className="text-xs font-medium text-muted-foreground mr-1">Research Signals:</span>
                            {SIGNAL_TAGS.map(tag => {
                                const count = tagCounts[tag.id] || 0;
                                const active = activeTagFilters.includes(tag.id);
                                return (
                                    <button
                                        key={tag.id}
                                        onClick={() => toggleTagFilter(tag.id)}
                                        title={tag.shortDescription}
                                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                                            active
                                                ? 'border-primary bg-primary/10 text-primary'
                                                : 'border-border text-muted-foreground hover:border-muted-foreground'
                                        }`}
                                    >
                                        {tag.emoji} {tag.label} ({count})
                                    </button>
                                );
                            })}
                            {activeTagFilters.length > 0 && (
                                <button
                                    onClick={() => setActiveTagFilters([])}
                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
                                >
                                    ✕ Clear
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Based on 9-year backtest (2017–2026). Not investment advice.{' '}
                            <button onClick={() => setCurrentView('signals')} className="underline hover:no-underline">Details</button>
                        </p>
                    </div>

                    {/* Data Table */}
                    <div className="rounded-md border border-border">
                        <div className="w-full overflow-auto">
                            <table className="w-full caption-bottom text-sm text-left">
                                <thead className="[&_tr]:border-b">
                                    <tr className="border-b transition-colors hover:bg-muted/50">
                                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground cursor-pointer" onClick={() => requestSort('publicationDate')}>Date <ArrowUpDown className="inline h-3 w-3 ml-1" /></th>
                                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground cursor-pointer" onClick={() => requestSort('issuer')}>Issuer <ArrowUpDown className="inline h-3 w-3 ml-1" /></th>
                                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground cursor-pointer" onClick={() => requestSort('marketSegment')}>Market <ArrowUpDown className="inline h-3 w-3 ml-1" /></th>
                                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground cursor-pointer" onClick={() => requestSort('person')}>Person <ArrowUpDown className="inline h-3 w-3 ml-1" /></th>
                                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Role</th>
                                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground cursor-pointer" onClick={() => requestSort('nature')}>Nature <ArrowUpDown className="inline h-3 w-3 ml-1" /></th>
                                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right cursor-pointer" onClick={() => requestSort('volume')}>Volume <ArrowUpDown className="inline h-3 w-3 ml-1" /></th>
                                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right cursor-pointer" onClick={() => requestSort('price')}>Price <ArrowUpDown className="inline h-3 w-3 ml-1" /></th>
                                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right cursor-pointer" onClick={() => requestSort('totalValue')}>Total Value <ArrowUpDown className="inline h-3 w-3 ml-1" /></th>
                                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Tags</th>
                                    </tr>
                                </thead>
                                <tbody className="[&_tr:last-child]:border-0">
                                    {paginatedData.map((t, i) => {
                                        const signal = getSignalInfo(t);
                                        return (
                                            <tr key={i} className="border-b transition-colors hover:bg-muted/50">
                                                <td className="p-4 align-middle">{t.publicationDate}</td>
                                                <td className="p-4 align-middle font-medium text-primary">
                                                    <div className="flex items-center gap-1.5">
                                                        <span>{t.issuer}</span>
                                                        {t.yahooUrl && (
                                                            <a href={t.yahooUrl} target="_blank" rel="noopener noreferrer" title="Yahoo Finance" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                                                                <ExternalLink className="h-3 w-3" />
                                                            </a>
                                                        )}
                                                        {t.avanzaUrl && (
                                                            <a href={t.avanzaUrl} target="_blank" rel="noopener noreferrer" title="Avanza" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                                                                <BarChart2 className="h-3 w-3" />
                                                            </a>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-4 align-middle">
                                                    <CapBadge capTier={t.capTier} />
                                                </td>
                                                <td className="p-4 align-middle">{t.person}</td>
                                                <td className="p-4 align-middle text-muted-foreground truncate max-w-[150px] overflow-hidden" title={t.position}>{t.position}</td>
                                                <td className="p-4 align-middle">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                                            t.nature.includes('Acquisition') ? 'bg-green-500/10 text-green-500' :
                                                            t.nature.includes('Disposal') ? 'bg-red-500/10 text-red-500' :
                                                            'bg-secondary text-secondary-foreground'
                                                        }`}>
                                                            {t.nature}
                                                        </span>
                                                        {signal.grade !== 'none' && (
                                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${signal.colorClass}`} title={`${signal.label}: ${t.totalValue?.toLocaleString()} SEK`}>
                                                                {signal.icon}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-4 align-middle text-right">{t.volume.toLocaleString()}</td>
                                                <td className="p-4 align-middle text-right">{t.price.toFixed(2)} {t.currency}</td>
                                                <td className="p-4 align-middle text-right">
                                                    {t.totalValue ? t.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'} {t.currency}
                                                </td>
                                                <td className="p-4 align-middle">
                                                    <RowTagBadges tags={t.tags || []} onTagClick={toggleTagFilter} />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {/* Pagination */}
                        <div className="flex items-center justify-between p-4 border-t border-border">
                            <div className="text-sm text-muted-foreground">
                                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, sortedData.length)} of {sortedData.length} entries
                            </div>
                            <div className="flex items-center space-x-2">
                                <button className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-4 disabled:pointer-events-none disabled:opacity-50" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                                    Previous
                                </button>
                                <span className="text-sm font-medium">Page {currentPage} of {Math.max(1, totalPages)}</span>
                                <button className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-4 disabled:pointer-events-none disabled:opacity-50" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Disclaimer */}
                    <p className="mt-6 text-center text-xs text-muted-foreground">
                        This site displays information, not investment advice. Signal tags are based on a 9-year backtest (2017–2026). Past performance does not guarantee future results.{' '}
                        <button onClick={() => setCurrentView('research')} className="underline hover:no-underline">Details</button>
                    </p>
                </>
            )}
        </div>
    );
}

// ─── Sub-Components ─────────────────────────────────────────────

function CapBadge({ capTier }: { capTier?: CapTier }) {
    if (!capTier || capTier === 'unknown') return null;
    const styles: Record<string, string> = {
        Large: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        Mid:   'bg-purple-500/10 text-purple-400 border-purple-500/20',
        Small: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    };
    return (
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles[capTier] || ''}`}>
            {capTier}
        </span>
    );
}

function RowTagBadges({ tags, onTagClick }: { tags: string[]; onTagClick: (id: string) => void }) {
    if (!tags.length) return null;
    return (
        <div className="flex gap-1">
            {tags.map(id => {
                const tag = TAG_MAP[id] as SignalTag | undefined;
                if (!tag) return null;
                return (
                    <button key={id} onClick={() => onTagClick(id)} title={tag.shortDescription} className="text-base leading-none hover:opacity-70 transition-opacity">
                        {tag.emoji}
                    </button>
                );
            })}
        </div>
    );
}

function SignalStatButton({ icon, label, count, colorClass, active, onClick }: {
    icon: string; label: string; count: number; colorClass: string; active: boolean; onClick: () => void;
}) {
    return (
        <button onClick={onClick} className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all hover:bg-muted/50 ${active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border'}`}>
            <span className="text-xl">{icon}</span>
            <div>
                <p className={`text-2xl font-bold ${colorClass}`}>{count.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
            </div>
        </button>
    );
}

function CEOCFOCard({ alert }: { alert: CEOCFOAlert }) {
    const fmt = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}k` : v.toFixed(0);
    return (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/8 p-3">
            <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm text-yellow-200 truncate max-w-[160px]" title={alert.issuer}>{alert.issuer}</span>
                <span className="text-xs text-muted-foreground ml-1 shrink-0">{alert.dateRange}</span>
            </div>
            <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-yellow-400 font-medium w-8 shrink-0">CEO</span>
                    <span className="text-muted-foreground truncate flex-1 mx-1" title={alert.ceo.person}>{alert.ceo.person}</span>
                    <span className="font-mono text-yellow-300 shrink-0">{fmt(alert.ceo.totalValue)} SEK</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                    <span className="text-yellow-400 font-medium w-8 shrink-0">CFO</span>
                    <span className="text-muted-foreground truncate flex-1 mx-1" title={alert.cfo.person}>{alert.cfo.person}</span>
                    <span className="font-mono text-yellow-300 shrink-0">{fmt(alert.cfo.totalValue)} SEK</span>
                </div>
            </div>
            <div className="mt-2 pt-2 border-t border-yellow-500/15 flex justify-between text-xs">
                <span className="text-muted-foreground">Combined</span>
                <span className="font-semibold text-yellow-200">Σ {fmt(alert.combinedValue)} SEK</span>
            </div>
        </div>
    );
}

function ClusterCard({ cluster }: { cluster: InsiderCluster }) {
    const fmt = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}k` : v.toFixed(0);
    return (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-sm text-amber-300">{cluster.issuer}</span>
                <span className="text-xs text-muted-foreground">{cluster.dateRange}</span>
            </div>
            <div className="space-y-1">
                {cluster.members.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate max-w-[200px]" title={m.position}>
                            {m.person} <span className="text-zinc-600">({m.position.split(' ').slice(0, 3).join(' ')})</span>
                        </span>
                        <span className="font-mono text-amber-400 ml-2">{fmt(m.totalValue)} SEK</span>
                    </div>
                ))}
            </div>
            <div className="mt-2 pt-2 border-t border-amber-500/10 flex justify-between text-xs">
                <span className="text-muted-foreground">{cluster.members.length} insiders · {cluster.transactionCount} txns</span>
                <span className="font-semibold text-amber-300">Σ {fmt(cluster.combinedValue)} SEK</span>
            </div>
        </div>
    );
}

// ─── Signal Tags Page ────────────────────────────────────────────

function SignalsView({ onNavigate }: { onNavigate: (view: View) => void }) {
    return (
        <div className="max-w-2xl">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-primary mb-2">Signal Tags</h2>
                <p className="text-muted-foreground text-sm">
                    Based on a 9-year backtest (2017–2026) of Swedish insider transactions from Finansinspektionen.
                    These tags filter transactions — they are not trading recommendations.
                </p>
            </div>
            <div className="space-y-4">
                {SIGNAL_TAGS.map(tag => (
                    <div key={tag.id} className="rounded-lg border border-border bg-card p-5">
                        <div className="flex items-start gap-3 mb-3">
                            <span className="text-2xl leading-none mt-0.5">{tag.emoji}</span>
                            <div>
                                <h3 className="font-semibold text-foreground">{tag.label}</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">{tag.shortDescription}</p>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">{tag.detailDescription}</p>
                        <div className="text-xs">
                            <span className="text-muted-foreground">Historical: </span>
                            <span className="font-mono text-foreground">{tag.historicalWinRate}</span>
                        </div>
                        {tag.warning && (
                            <div className="mt-3 rounded border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-400">
                                ⚠️ {tag.warning}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <div className="mt-6 text-center">
                <button onClick={() => onNavigate('research')} className="text-sm text-muted-foreground hover:text-foreground transition-colors underline">
                    View research methodology →
                </button>
            </div>
        </div>
    );
}

// ─── Research Page ───────────────────────────────────────────────

function ResearchView() {
    return (
        <div className="max-w-2xl">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-primary mb-2">Research Methodology</h2>
                <p className="text-muted-foreground text-sm">
                    Signal tags are based on a 9-year backtest (2017–2026) of Swedish insider trading data from Finansinspektionen.
                </p>
            </div>
            <div className="space-y-4 text-sm">
                <div className="rounded-lg border border-border bg-card p-5">
                    <h3 className="font-semibold text-foreground mb-3">Key Findings</h3>
                    <ul className="space-y-2 list-disc list-inside text-muted-foreground">
                        <li>Insider buying alone shows weak alpha that disappears when controlling for momentum</li>
                        <li><strong className="text-foreground">Large Cap CFO cash buys:</strong> 79.8% win rate (n=99) reaching +8% in 90 days</li>
                        <li><strong className="text-foreground">Single trades &gt; 10M SEK:</strong> 65.4% win rate (n=78) reaching +10%</li>
                        <li>Chairman buys historically show negative alpha — not a buy signal</li>
                        <li>Cluster buying shows no improvement over single buys after size control</li>
                        <li>Aggregate insider activity does NOT predict OMX index returns at any horizon (correlation &lt; 0.2)</li>
                    </ul>
                </div>
                <div className="rounded-lg border border-border bg-card p-5">
                    <h3 className="font-semibold text-foreground mb-3">Limitations</h3>
                    <ul className="space-y-2 list-disc list-inside text-muted-foreground">
                        <li>Past performance does not guarantee future results</li>
                        <li>Sample sizes are small for some subsets (n &lt; 100)</li>
                        <li>Strategy returns assume frictionless execution</li>
                        <li>2020 COVID crash was the only consistently negative period — extreme drawdowns are possible</li>
                    </ul>
                </div>
                <div className="rounded-lg border border-border bg-card p-5">
                    <h3 className="font-semibold text-foreground mb-3">Why We Show All Signals</h3>
                    <p className="text-muted-foreground">
                        Information transparency is the primary value of this site, not trading recommendations.
                        We show what the research found — including signals that did not work — so you can make informed decisions.
                    </p>
                </div>
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-5">
                    <p className="font-medium text-yellow-400 mb-1">Independent research recommended</p>
                    <p className="text-muted-foreground">
                        Do not trade based on these tags alone. They are filters for browsing data, not buy recommendations.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default App;
