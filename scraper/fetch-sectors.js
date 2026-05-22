// Fetches GICS sector data from Yahoo Finance for each known ticker.
// Run manually or via the fetch-sectors workflow (monthly).
// Results are cached in ticker_sector.json — only missing/Unknown entries are re-fetched.

import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import yahooFinance from 'yahoo-finance2'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '../frontend/public/data')

async function fetchSector(ticker) {
  try {
    const result = await yahooFinance.quoteSummary(ticker, { modules: ['assetProfile'] }, { validateResult: false })
    return result?.assetProfile?.sector || 'Unknown'
  } catch {
    return 'Unknown'
  }
}

async function main() {
  const isinToTicker = fs.readJsonSync(path.join(DATA_DIR, 'isin_ticker.json'))
  const tickers = [...new Set(Object.values(isinToTicker).filter(Boolean))]

  const outFile = path.join(DATA_DIR, 'ticker_sector.json')
  const result  = fs.existsSync(outFile) ? fs.readJsonSync(outFile) : {}

  const toFetch = tickers.filter(t => !result[t] || result[t] === 'Unknown')
  const cached  = tickers.length - toFetch.length

  console.log(`${tickers.length} tickers total — ${cached} cached, ${toFetch.length} to fetch`)
  if (toFetch.length === 0) { console.log('Nothing to do.'); return }

  let done = 0
  for (const ticker of toFetch) {
    result[ticker] = await fetchSector(ticker)
    done++
    if (done % 50 === 0) console.log(`  ${done}/${toFetch.length} fetched…`)
    await new Promise(r => setTimeout(r, 250))
  }

  fs.writeJsonSync(outFile, result, { spaces: 2 })
  console.log(`Done. Written to ${outFile}`)
}

main().catch(err => { console.error(err.message); process.exit(1) })
