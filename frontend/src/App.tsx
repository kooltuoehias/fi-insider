import React, { useEffect, useState } from 'react';
import { Transaction, loadTransactions } from './types';
import { getSignalInfo, detectClusters, InsiderCluster, detectCEOCFOBuys, CEOCFOAlert } from './analysis';
import { Search, ArrowUpDown, Download, TrendingUp, Building2, AlertTriangle, Users } from 'lucide-react';

function App() {
    const [data, setData] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Transaction; direction: 'asc' | 'desc' } | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [signalFilter, setSignalFilter] = useState<string | null>(null);
    const itemsPerPage = 100;

    useEffect(() => {
        loadTransactions().then((transactions) => {
            setData(transactions);
            setLoading(false);
        });
    }, []);

    // Cluster detection
    const clusters = React.useMemo(() => {
        return detectClusters(data, 30);
    }, [data]);

    // CEO + CFO dual buy detection
    const ceoCfoAlerts = React.useMemo(() => {
        return detectCEOCFOBuys(data, 90);
    }, [data]);

    // Signal grade counts
    const signalCounts = React.useMemo(() => {
        const counts = { 'table-pounding': 0, conviction: 0, watch: 0, junk: 0 };
        data.forEach(t => {
            if (t.signalGrade && t.signalGrade in counts) {
                counts[t.signalGrade as keyof typeof counts]++;
            }
        });
        return counts;
    }, [data]);

    const sortedData = React.useMemo(() => {
        let sortableItems = [...data];

        // Text filter
        if (filter) {
            const lowerFilter = filter.toLowerCase();
            sortableItems = sortableItems.filter(item =>
                item.issuer.toLowerCase().includes(lowerFilter) ||
                item.person.toLowerCase().includes(lowerFilter) ||
                item.instrument.toLowerCase().includes(lowerFilter) ||
                (item.position && item.position.toLowerCase().includes(lowerFilter))
            );
        }

        // Signal filter
        if (signalFilter) {
            sortableItems = sortableItems.filter(item => item.signalGrade === signalFilter);
        }

        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const valA = a[sortConfig.key] ?? '';
                const valB = b[sortConfig.key] ?? '';

                if (valA < valB) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (valA > valB) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [data, sortConfig, filter, signalFilter]);

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

    // Reset page when filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [filter, signalFilter]);

    if (loading) {
        return <div className="min-h-screen bg-background text-foreground flex items-center justify-center">Loading Data...</div>;
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-8 font-sans">
            <header className="mb-8 flex justify-between items-center border-b border-border pb-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-primary">Swedish Insider Dashboard</h1>
                    <p className="text-muted-foreground mt-1">Analyzing {data.length.toLocaleString()} transactions</p>
                </div>
                <div className="flex gap-4">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search issuer, person..."
                            className="pl-9 h-10 w-[300px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={downloadCSV}
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                    >
                        <Download className="mr-2 h-4 w-4" /> Export CSV
                    </button>
                </div>
            </header>

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
            <section className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Insider Cluster Alerts */}
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

                {/* Signal Breakdown */}
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <AlertTriangle className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-semibold">Signal Breakdown</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <SignalStatButton
                            icon="🔥" label="Table-Pounding" count={signalCounts['table-pounding']}
                            colorClass="text-red-400" active={signalFilter === 'table-pounding'}
                            onClick={() => setSignalFilter(signalFilter === 'table-pounding' ? null : 'table-pounding')}
                        />
                        <SignalStatButton
                            icon="💎" label="Conviction" count={signalCounts.conviction}
                            colorClass="text-emerald-400" active={signalFilter === 'conviction'}
                            onClick={() => setSignalFilter(signalFilter === 'conviction' ? null : 'conviction')}
                        />
                        <SignalStatButton
                            icon="👀" label="Watch" count={signalCounts.watch}
                            colorClass="text-yellow-400" active={signalFilter === 'watch'}
                            onClick={() => setSignalFilter(signalFilter === 'watch' ? null : 'watch')}
                        />
                        <SignalStatButton
                            icon="🧹" label="Token" count={signalCounts.junk}
                            colorClass="text-zinc-500" active={signalFilter === 'junk'}
                            onClick={() => setSignalFilter(signalFilter === 'junk' ? null : 'junk')}
                        />
                    </div>
                    {signalFilter && (
                        <button
                            onClick={() => setSignalFilter(null)}
                            className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            ✕ Clear filter
                        </button>
                    )}
                </div>
            </section>

            {/* Data Table */}
            <div className="rounded-md border border-border">
                <div className="w-full overflow-auto">
                    <table className="w-full caption-bottom text-sm text-left">
                        <thead className="[&_tr]:border-b">
                            <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground cursor-pointer" onClick={() => requestSort('publicationDate')}>Date <ArrowUpDown className="inline h-3 w-3 ml-1" /></th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground cursor-pointer" onClick={() => requestSort('issuer')}>Issuer <ArrowUpDown className="inline h-3 w-3 ml-1" /></th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground cursor-pointer" onClick={() => requestSort('marketSegment')}>Market <ArrowUpDown className="inline h-3 w-3 ml-1" /></th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground cursor-pointer" onClick={() => requestSort('person')}>Person <ArrowUpDown className="inline h-3 w-3 ml-1" /></th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Role</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground cursor-pointer" onClick={() => requestSort('nature')}>Nature <ArrowUpDown className="inline h-3 w-3 ml-1" /></th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right cursor-pointer" onClick={() => requestSort('volume')}>Volume <ArrowUpDown className="inline h-3 w-3 ml-1" /></th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right cursor-pointer" onClick={() => requestSort('price')}>Price <ArrowUpDown className="inline h-3 w-3 ml-1" /></th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right cursor-pointer" onClick={() => requestSort('totalValue')}>Total Value <ArrowUpDown className="inline h-3 w-3 ml-1" /></th>
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                            {paginatedData.map((t, i) => {
                                const signal = getSignalInfo(t);
                                return (
                                    <tr key={i} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                        <td className="p-4 align-middle">{t.publicationDate}</td>
                                        <td className="p-4 align-middle font-medium text-primary">{t.issuer}</td>
                                        <td className="p-4 align-middle">
                                            {(t.marketSegment === 'Large Cap' || t.marketSegment === 'Mid Cap') && (
                                                <div className="flex items-center gap-1.5" title={t.marketSegment}>
                                                    {t.marketSegment === 'Large Cap' ? <Building2 className="h-4 w-4 text-blue-500" /> :
                                                        <TrendingUp className="h-4 w-4 text-purple-500" />
                                                    }
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 align-middle">{t.person}</td>
                                        <td className="p-4 align-middle text-muted-foreground truncate max-w-[150px] overflow-hidden" title={t.position}>{t.position}</td>
                                        <td className="p-4 align-middle">
                                            <div className="flex items-center gap-2">
                                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${t.nature.includes('Acquisition') ? 'bg-green-500/10 text-green-500' :
                                                    t.nature.includes('Disposal') ? 'bg-red-500/10 text-red-500' :
                                                        'bg-secondary text-secondary-foreground'
                                                    }`}>
                                                    {t.nature}
                                                </span>
                                                {signal.grade !== 'none' && (
                                                    <span
                                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${signal.colorClass}`}
                                                        title={`${signal.label}: ${t.totalValue?.toLocaleString()} SEK`}
                                                    >
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
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {/* Pagination Controls */}
                <div className="flex items-center justify-between p-4 border-t border-border">
                    <div className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, sortedData.length)} of {sortedData.length} entries
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-4"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                        >
                            Previous
                        </button>
                        <span className="text-sm font-medium">
                            Page {currentPage} of {Math.max(1, totalPages)}
                        </span>
                        <button
                            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-4"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Sub-Components ─────────────────────────────────────────────

function SignalStatButton({ icon, label, count, colorClass, active, onClick }: {
    icon: string; label: string; count: number; colorClass: string; active: boolean; onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all hover:bg-muted/50 ${active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border'
                }`}
        >
            <span className="text-xl">{icon}</span>
            <div>
                <p className={`text-2xl font-bold ${colorClass}`}>{count.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
            </div>
        </button>
    );
}

function CEOCFOCard({ alert }: { alert: CEOCFOAlert }) {
    const formatValue = (v: number) => {
        if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
        if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
        return v.toFixed(0);
    };

    return (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/8 p-3">
            <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm text-yellow-200 truncate max-w-[160px]" title={alert.issuer}>
                    {alert.issuer}
                </span>
                <span className="text-xs text-muted-foreground ml-1 shrink-0">{alert.dateRange}</span>
            </div>
            <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-yellow-400 font-medium w-8 shrink-0">CEO</span>
                    <span className="text-muted-foreground truncate flex-1 mx-1" title={alert.ceo.person}>{alert.ceo.person}</span>
                    <span className="font-mono text-yellow-300 shrink-0">{formatValue(alert.ceo.totalValue)} SEK</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                    <span className="text-yellow-400 font-medium w-8 shrink-0">CFO</span>
                    <span className="text-muted-foreground truncate flex-1 mx-1" title={alert.cfo.person}>{alert.cfo.person}</span>
                    <span className="font-mono text-yellow-300 shrink-0">{formatValue(alert.cfo.totalValue)} SEK</span>
                </div>
            </div>
            <div className="mt-2 pt-2 border-t border-yellow-500/15 flex justify-between text-xs">
                <span className="text-muted-foreground">Combined</span>
                <span className="font-semibold text-yellow-200">Σ {formatValue(alert.combinedValue)} SEK</span>
            </div>
        </div>
    );
}

function ClusterCard({ cluster }: { cluster: InsiderCluster }) {
    const formatValue = (v: number) => {
        if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
        if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
        return v.toFixed(0);
    };

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
                        <span className="font-mono text-amber-400 ml-2">{formatValue(m.totalValue)} SEK</span>
                    </div>
                ))}
            </div>
            <div className="mt-2 pt-2 border-t border-amber-500/10 flex justify-between text-xs">
                <span className="text-muted-foreground">{cluster.members.length} insiders · {cluster.transactionCount} txns</span>
                <span className="font-semibold text-amber-300">Σ {formatValue(cluster.combinedValue)} SEK</span>
            </div>
        </div>
    );
}

export default App;
