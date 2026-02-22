import React, { useEffect, useState } from 'react';
import { Transaction, loadTransactions } from './types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Search, ArrowUpDown, Download, TrendingUp, Building2 } from 'lucide-react';

function App() {
    const [data, setData] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Transaction; direction: 'asc' | 'desc' } | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 100;

    useEffect(() => {
        loadTransactions().then((transactions) => {
            setData(transactions);
            setLoading(false);
        });
    }, []);

    const sortedData = React.useMemo(() => {
        let sortableItems = [...data];
        if (filter) {
            const lowerFilter = filter.toLowerCase();
            sortableItems = sortableItems.filter(item =>
                item.issuer.toLowerCase().includes(lowerFilter) ||
                item.person.toLowerCase().includes(lowerFilter) ||
                item.instrument.toLowerCase().includes(lowerFilter) ||
                (item.position && item.position.toLowerCase().includes(lowerFilter))
            );
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
    }, [data, sortConfig, filter]);

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
    }, [filter]);

    // Simple chart data aggregation (Top 5 issuers by volume)
    const chartData = React.useMemo(() => {
        const agg: Record<string, number> = {};
        data.forEach(d => {
            if (!agg[d.issuer]) agg[d.issuer] = 0;
            agg[d.issuer] += (d.volume * d.price); // Approx value
        });
        return Object.entries(agg)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [data]);

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

            {/* Chart Section */}
            <section className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                    <h3 className="text-lg font-semibold mb-4">Top Issuers by Transaction Value</h3>
                    <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis dataKey="name" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `SEK ${(value / 1000000).toFixed(0)}M`} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e293b', border: 'none' }}
                                    itemStyle={{ color: '#f8fafc' }}
                                />
                                <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                {/* Placeholder for another chart or stat */}
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6 flex items-center justify-center">
                    <div className="text-center">
                        <p className="text-4xl font-bold text-primary">{sortedData.length}</p>
                        <p className="text-muted-foreground">Transactions Found</p>
                    </div>
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
                            {paginatedData.map((t, i) => (
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
                                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${t.nature.includes('Acquisition') ? 'bg-green-500/10 text-green-500' :
                                            t.nature.includes('Disposal') ? 'bg-red-500/10 text-red-500' :
                                                'bg-secondary text-secondary-foreground'
                                            }`}>
                                            {t.nature}
                                        </span>
                                    </td>
                                    <td className="p-4 align-middle text-right">{t.volume.toLocaleString()}</td>
                                    <td className="p-4 align-middle text-right">{t.price.toFixed(2)} {t.currency}</td>
                                    <td className="p-4 align-middle text-right">
                                        {t.totalValue ? t.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'} {t.currency}
                                    </td>
                                </tr>
                            ))}
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

export default App;
