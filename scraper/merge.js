// Merges per-year files back into transactions.json for incremental scraper mode
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(__dirname, '../frontend/public/data')

const yearFiles = readdirSync(dataDir)
    .filter(f => /^transactions_\d{4}\.json$/.test(f))
    .sort()

if (yearFiles.length === 0) {
    console.log('No year files found, skipping merge.')
    process.exit(0)
}

let all = []
for (const f of yearFiles) {
    const txns = JSON.parse(readFileSync(`${dataDir}/${f}`, 'utf-8'))
    all = all.concat(txns)
    console.log(`  ${f}: ${txns.length} txns`)
}

// Sort newest first (publicationDate is DD/MM/YYYY)
all.sort((a, b) => {
    const toMs = d => { const [dd, mm, yy] = d.split('/'); return new Date(yy, mm - 1, dd).getTime() }
    return toMs(b.publicationDate) - toMs(a.publicationDate)
})

writeFileSync(`${dataDir}/transactions.json`, JSON.stringify(all, null, 2))
console.log(`Merged ${all.length} transactions → transactions.json`)
