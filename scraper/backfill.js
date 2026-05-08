import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs-extra';
import path from 'path';

/**
 * STANDALONE BACKFILL SCRIPT
 * This script is separate from index.js and is designed to fetch historical data
 * from the Swedish Insider Register using date range filters.
 */

const BASE_URL = 'https://marknadssok.fi.se/Publiceringsklient/en-GB/Search/Search/Insyn';
const OUTPUT_FILE = path.join(process.cwd(), '..', 'frontend', 'public', 'data', 'transactions.json');
const STATE_FILE = path.join(process.cwd(), 'backfill_state.json');
const YEARS_BACK = 10;
const CUTOFF_DATE = new Date();
CUTOFF_DATE.setFullYear(CUTOFF_DATE.getFullYear() - YEARS_BACK);

async function fetchPage(page, fromDate, toDate) {
    try {
        const params = {
            SearchFunctionType: 'Insyn',
            button: 'search',
            paging: 'True',
            page: page,
            'Publiceringsdatum.From': fromDate,
            'Publiceringsdatum.To': toDate
        };

        const response = await axios.get(BASE_URL, {
            params,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching page ${page}:`, error.message);
        return null;
    }
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
}

async function backfill() {
    console.log(`Starting historical backfill (Target: ${YEARS_BACK} years back to ${CUTOFF_DATE.toISOString().split('T')[0]})...`);

    let existingTransactions = [];
    let existingSignatures = new Set();
    let oldestDate = null;

    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            existingTransactions = fs.readJsonSync(OUTPUT_FILE);
            console.log(`Loaded ${existingTransactions.length} existing records.`);
            
            const dates = [];
            existingTransactions.forEach(t => {
                const sig = `${t.publicationDate}|${t.issuer}|${t.person}|${t.volume}|${t.price}|${t.transactionDate}`;
                existingSignatures.add(sig);
                const d = parseDate(t.publicationDate);
                if (d) dates.push(d.getTime());
            });

            if (dates.length > 0) {
                oldestDate = new Date(Math.min(...dates));
                console.log(`Oldest existing record: ${oldestDate.toISOString().split('T')[0]}`);
            }
        } catch (e) {
            console.warn('Could not read existing data file.');
        }
    }

    if (!oldestDate) {
        console.log('No existing data found. Starting from today.');
        oldestDate = new Date();
    }

    if (oldestDate <= CUTOFF_DATE) {
        console.log('Existing data already reaches the target cutoff. Nothing to backfill.');
        return;
    }

    // Range to fetch: from CUTOFF_DATE to (oldestDate - 1 day)
    const fromDateStr = CUTOFF_DATE.toISOString().split('T')[0];
    const toDate = new Date(oldestDate);
    toDate.setDate(toDate.getDate() - 1);
    const toDateStr = toDate.toISOString().split('T')[0];

    console.log(`Target Range: ${fromDateStr} to ${toDateStr}`);

    let page = 1;
    let newTransactionsBuffer = [];

    // Resume if state exists for this range
    if (fs.existsSync(STATE_FILE)) {
        try {
            const state = fs.readJsonSync(STATE_FILE);
            if (state.fromDate === fromDateStr && state.toDate === toDateStr) {
                page = state.lastPage;
                console.log(`Resuming from page ${page}`);
            }
        } catch (e) {}
    }

    while (true) {
        console.log(`Fetching page ${page} [${fromDateStr} - ${toDateStr}]...`);
        const html = await fetchPage(page, fromDateStr, toDateStr);
        if (!html) {
            console.log('Failed to fetch. Retrying in 5s...');
            await new Promise(r => setTimeout(r, 5000));
            continue;
        }

        const $ = cheerio.load(html);
        const rows = $('tbody tr');
        if (rows.length === 0) {
            console.log('No more records found for this range.');
            break;
        }

        let pageCount = 0;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const cols = $(row).find('td');
            if (cols.length === 0) continue;

            const transaction = {
                publicationDate: $(cols[0]).text().trim(),
                issuer: $(cols[1]).text().trim(),
                person: $(cols[2]).text().trim(),
                position: $(cols[3]).text().trim(),
                closelyAssociated: $(cols[4]).text().trim() === 'Yes',
                nature: $(cols[5]).text().trim(),
                instrument: $(cols[6]).text().trim(),
                instrumentType: $(cols[7]).text().trim(),
                isin: $(cols[8]).text().trim(),
                transactionDate: $(cols[9]).text().trim(),
                volume: parseFloat($(cols[10]).text().trim().replace(/,/g, '')),
                unit: $(cols[11]).text().trim(),
                price: parseFloat($(cols[12]).text().trim().replace(/,/g, '')),
                currency: $(cols[13]).text().trim(),
                status: $(cols[14]).text().trim(),
                details: $(cols[15]).text().trim()
            };

            const sig = `${transaction.publicationDate}|${transaction.issuer}|${transaction.person}|${transaction.volume}|${transaction.price}|${transaction.transactionDate}`;
            if (!existingSignatures.has(sig)) {
                newTransactionsBuffer.push(transaction);
                existingSignatures.add(sig);
                pageCount++;
            }
        }

        console.log(`Page ${page}: Added ${pageCount} new historical records.`);

        // Intermediate save every 5 pages
        if (page % 5 === 0 && newTransactionsBuffer.length > 0) {
            console.log('Saving progress...');
            existingTransactions.push(...newTransactionsBuffer);
            newTransactionsBuffer = [];
            
            // Sort by publication date descending
            existingTransactions.sort((a, b) => {
                const da = parseDate(a.publicationDate) || 0;
                const db = parseDate(b.publicationDate) || 0;
                return db - da;
            });

            fs.writeJsonSync(OUTPUT_FILE, existingTransactions, { spaces: 2 });
            fs.writeJsonSync(STATE_FILE, { lastPage: page + 1, fromDate: fromDateStr, toDate: toDateStr });
        }

        page++;
        await new Promise(r => setTimeout(r, 500));
    }

    // Final Merge & Save
    if (newTransactionsBuffer.length > 0) {
        existingTransactions.push(...newTransactionsBuffer);
    }
    
    existingTransactions.sort((a, b) => {
        const da = parseDate(a.publicationDate) || 0;
        const db = parseDate(b.publicationDate) || 0;
        return db - da;
    });

    fs.writeJsonSync(OUTPUT_FILE, existingTransactions, { spaces: 2 });
    fs.removeSync(STATE_FILE);

    console.log(`Backfill complete. Total records now: ${existingTransactions.length}`);
}

backfill().catch(console.error);
