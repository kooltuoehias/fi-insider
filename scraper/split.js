// Splits transactions.json into per-year files for Cloudflare Pages (25 MB/file limit)
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(__dirname, '../frontend/public/data')

const data = JSON.parse(readFileSync(`${dataDir}/transactions.json`, 'utf-8'))
console.log(`Splitting ${data.length} transactions by year...`)

const byYear = new Map()
for (const tx of data) {
    const year = tx.publicationDate?.split('/')[2]
    if (!year || year.length !== 4) continue
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year).push(tx)
}

for (const [year, txns] of byYear) {
    const json = JSON.stringify(txns)
    writeFileSync(`${dataDir}/transactions_${year}.json`, json)
    console.log(`  transactions_${year}.json  ${txns.length} txns  ${Math.round(json.length / 1024)} KB`)
}

console.log('Done.')
