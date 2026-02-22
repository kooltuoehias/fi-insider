import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs-extra';
import path from 'path';

// Configuration
const BASE_URL = 'https://marknadssok.fi.se/Publiceringsklient/en-GB/Search/Search/Insyn';
const OUTPUT_FILE = path.join(process.cwd(), '..', 'frontend', 'public', 'data', 'transactions.json');
const STATE_FILE = path.join(process.cwd(), 'scraper_state.json');
const YEARS_TO_SCRAPE = 5;
const CUTOFF_DATE = new Date();
CUTOFF_DATE.setFullYear(CUTOFF_DATE.getFullYear() - YEARS_TO_SCRAPE);

// Ensure data directory exists
fs.ensureDirSync(path.join(process.cwd(), '..', 'frontend', 'public', 'data'));

// State management
let state = {
    lastPage: 1,
    totalRecords: 0
};

if (fs.existsSync(STATE_FILE)) {
    try {
        state = fs.readJsonSync(STATE_FILE);
        console.log(`Resuming from page ${state.lastPage}`);
    } catch (e) {
        console.warn('Could not read state file, starting fresh.');
    }
}

async function fetchPage(page) {
    try {
        const response = await axios.get(BASE_URL, {
            params: {
                SearchFunctionType: 'Insyn',
                button: 'search',
                paging: 'True',
                page: page
            },
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
    // Format: DD/MM/YYYY
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`); // YYYY-MM-DD
}

async function scrape() {
    console.log(`Starting scrape...`);

    let existingTransactions = [];
    let existingSignatures = new Set();

    // Load existing data
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            existingTransactions = fs.readJsonSync(OUTPUT_FILE);
            console.log(`Loaded ${existingTransactions.length} existing records.`);

            // Create signatures for quick lookup
            existingTransactions.forEach(t => {
                const sig = `${t.publicationDate}|${t.issuer}|${t.person}|${t.volume}|${t.price}|${t.transactionDate}`;
                existingSignatures.add(sig);
            });
        } catch (e) {
            console.warn('Could not read output file, starting fresh.');
        }
    } else {
        console.log('No existing data found. Performing full scrape for past 5 years.');
    }

    const isIncremental = existingTransactions.length > 0;
    let page = 1; // Always start from page 1 for incremental

    // If we are doing a full scrape (no existing data), we might want to resume from state
    if (!isIncremental && fs.existsSync(STATE_FILE)) {
        try {
            const state = fs.readJsonSync(STATE_FILE);
            page = state.lastPage;
            console.log(`Resuming full scrape from page ${page}`);
        } catch (e) {
            // ignore
        }
    }

    let stopScraping = false;
    let newTransactions = [];
    let consecutiveExistingCount = 0; // Tolerance for duplicates

    while (!stopScraping) {
        console.log(`Fetching page ${page}...`);
        const html = await fetchPage(page);

        if (!html) {
            console.log('Failed to fetch page, retrying in 5 seconds...');
            await new Promise(r => setTimeout(r, 5000));
            continue;
        }

        const $ = cheerio.load(html);
        const rows = $('tbody tr');

        if (rows.length === 0) {
            console.log('No more rows found. Stopping.');
            break;
        }

        let pageNewCount = 0;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const cols = $(row).find('td');
            if (cols.length === 0) continue;

            const pubDateStr = $(cols[0]).text().trim();
            const pubDate = parseDate(pubDateStr);

            // FULL SCRAPE cutoff check
            if (!isIncremental && pubDate && pubDate < CUTOFF_DATE) {
                console.log(`Reached cutoff date ${CUTOFF_DATE.toISOString().split('T')[0]}. Stopping.`);
                stopScraping = true;
                break;
            }

            const transaction = {
                publicationDate: pubDateStr,
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

            if (isIncremental && existingSignatures.has(sig)) {
                consecutiveExistingCount++;
                // If we see 3 records in a row that we already have, we assume we've caught up.
                // We use 3 just to be safe against random duplicates or re-sorting.
                if (consecutiveExistingCount >= 3) {
                    console.log('Found overlap with existing data. Stopping incremental update.');
                    stopScraping = true;
                    break;
                }
            } else {
                consecutiveExistingCount = 0; // Reset count
                newTransactions.push(transaction);
                pageNewCount++;
            }
        }

        console.log(`Page ${page}: Found ${pageNewCount} new records.`);

        if (!isIncremental) {
            // For full scrape, append immediately to keep memory usage low(ish) and save state
            if (pageNewCount > 0) {
                existingTransactions.push(...newTransactions); // In full scrape mode, newTransactions contains the current page's rows
                newTransactions = []; // clear buffer
                if (page % 10 === 0) {
                    fs.writeJsonSync(OUTPUT_FILE, existingTransactions, { spaces: 2 });
                    fs.writeJsonSync(STATE_FILE, { lastPage: page + 1 });
                    console.log(`Saved progress. Total: ${existingTransactions.length}`);
                }
            }
        }

        if (stopScraping) break;

        page++;
        await new Promise(r => setTimeout(r, 500));
    }

    // Merge and Save
    if (isIncremental) {
        if (newTransactions.length > 0) {
            console.log(`Adding ${newTransactions.length} new records to database.`);
            const finalData = [...newTransactions, ...existingTransactions];
            fs.writeJsonSync(OUTPUT_FILE, finalData, { spaces: 2 });
        } else {
            console.log('No new records found.');
        }
    } else {
        // Final save for full scrape
        fs.writeJsonSync(OUTPUT_FILE, existingTransactions, { spaces: 2 });
        if (stopScraping) fs.removeSync(STATE_FILE);
    }

    console.log('Done.');
}

scrape().catch(console.error);
