# FI Insider — Agent Context

## Project Summary
Swedish Insider Transaction Dashboard. Scrapes public data from Finansinspektionen (FI), displays it in a React dashboard with search, sort, pagination, CSV export, and market segment classification.

## Architecture
- **`scraper/`** — Node.js script. Fetches HTML from `marknadssok.fi.se`, parses with cheerio, outputs `transactions.json` directly into `frontend/public/data/`.
- **`frontend/`** — React + Vite + Tailwind CSS. Uses Yarn 4 (Berry). Reads `transactions.json`, `lc.log`, `mc.log` from `public/data/` at runtime via `fetch()`. Fuzzy matches issuers to market segments using `string-similarity`.
- **`.github/workflows/scrape.yml`** — GitHub Actions cron (weekdays 15:45 UTC). Runs scraper, auto-commits updated data. Triggers Cloudflare Pages rebuild.

## Deployment
- **Hosting:** Cloudflare Pages (static site from `frontend/dist`)
- **Anti-abuse:** Cloudflare Access with email OTP
- **Data refresh:** GitHub Actions (daily after Swedish market close)

## Key Files
| File | Purpose |
|---|---|
| `scraper/index.js` | Main scraper script |
| `frontend/src/App.tsx` | Dashboard UI component |
| `frontend/src/types.ts` | Transaction type + data loading with fuzzy matching |
| `frontend/public/data/lc.log` | Large Cap company list |
| `frontend/public/data/mc.log` | Mid Cap company list |

## Development
```bash
# Scraper
cd scraper && npm install && node index.js

# Frontend
cd frontend && yarn install && yarn dev  # runs on localhost:6175
```
