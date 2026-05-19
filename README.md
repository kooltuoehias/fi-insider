# FI Insider

> Swedish insider trading monitor — tracks public filings from Finansinspektionen, graded by signal strength.

[![CI](https://github.com/kooltuoehias/fi-insider/actions/workflows/ci.yml/badge.svg)](https://github.com/kooltuoehias/fi-insider/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/kooltuoehias/fi-insider/branch/main/graph/badge.svg)](https://codecov.io/gh/kooltuoehias/fi-insider)
[![Last Commit](https://img.shields.io/github/last-commit/kooltuoehias/fi-insider)](https://github.com/kooltuoehias/fi-insider/commits/main)
![React](https://img.shields.io/badge/React_18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite_5-646CFF?logo=vite&logoColor=white)

Data is scraped daily from the [FI public registry](https://marknadssok.fi.se/Publiceringsklient) and auto-deployed via Cloudflare Pages. No backend — all analysis runs client-side.

## Features

- **Signal Grading** — acquisitions ranked Table-Pounding / Conviction / Watch / Token by SEK value
- **Cluster Detection** — flags stocks where 2+ insiders buy within 30 days
- **CEO + CFO Alerts** — when both C-suite officers buy within 90 days
- **Market Segments** — Large / Mid / Small Cap via ISIN lookup with Yahoo Finance market caps
- **Backtested Tags** — Large Cap CFO buys (79.8% win rate), Huge Single (≥10M SEK), Chairman Warning (inverse signal)
- **CSV Export** — download any filtered view

## Architecture

```
fi-insider/
├── scraper/       # Node.js scraper → outputs to frontend/public/data/
├── frontend/      # React + Vite + Tailwind CSS dashboard
└── .github/       # GitHub Actions for automated daily scraping
```

**Data flow:** Scraper fetches HTML from `marknadssok.fi.se`, parses with cheerio, writes per-year JSON files. GitHub Actions runs daily at 15:45 UTC. Cloudflare Pages auto-deploys on every commit.

## Local Development

```bash
# Scraper
cd scraper && npm install && npm start

# Frontend
cd frontend && yarn install && yarn dev
# → http://localhost:6175
```

## Tests

```bash
cd frontend
yarn test             # run once
yarn test:coverage    # with coverage report
```
