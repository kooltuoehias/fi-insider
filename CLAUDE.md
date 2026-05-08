# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (`cd frontend`)
```bash
yarn dev        # Dev server on http://localhost:6175
yarn build      # TypeScript check + Vite build → dist/
yarn lint       # ESLint — zero warnings allowed
yarn preview    # Preview production build locally
```

### Scraper (`cd scraper`)
```bash
npm start           # Incremental or full scrape → frontend/public/data/transactions.json
npm run backfill    # Backfill 10 years of historical data (resumable)
```

## Architecture

**Data flow:** `scraper/index.js` fetches HTML from `marknadssok.fi.se`, parses with cheerio, writes `frontend/public/data/transactions.json`. GitHub Actions runs the scraper daily at 15:45 UTC. Cloudflare Pages auto-deploys on every commit.

**Frontend:** Static React + Vite + TypeScript app. All data processing is client-side. On mount, `loadTransactions()` in `types.ts` fetches the JSON data files, then enriches each record with `totalValue`, `marketSegment`, and `signalGrade` before passing to the app.

**No backend API.** The scraper is a CLI tool, the frontend is a static site. There are no environment variables.

## Key Design Decisions

### Signal Grading (analysis.ts)
Acquisitions only. Graded by `totalValue` (volume × price):
- **Table-Pounding**: ≥ 1,000,000 SEK
- **Conviction**: ≥ 500,000 SEK
- **Watch**: ≥ 200,000 SEK
- **Token**: < 200,000 SEK

### Market Segment Classification (types.ts)
`lc.log` = Large Cap names (one per line), `mc.log` = Mid Cap names. `loadTransactions()` first tries exact match, then falls back to fuzzy match via `string-similarity` with threshold 0.6. Results are memoized by issuer name to avoid repeated fuzzy matching over the large dataset.

### Insider Cluster Detection (analysis.ts)
`detectClusters()` flags stocks where 2+ distinct insiders buy within 30 days. `detectCEOCFOBuys()` flags when both CEO and CFO (different people) buy within 90 days.

### Scraper Modes (scraper/index.js)
- **Incremental mode** (data already exists): scrapes from page 1, stops when 3 consecutive duplicate signatures are found, prepends new records.
- **Full mode** (no data or forced): resumable via `scraper_state.json` (deleted on completion), stops when publication date < 5-year cutoff.

Deduplication uses a signature string: `date|issuer|person|volume|price|txDate`.

## Package Managers
- **Frontend:** Yarn 4 Berry — use `yarn`, not `npm`
- **Scraper:** npm — use `npm`, not `yarn`
