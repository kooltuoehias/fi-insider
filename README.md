# FI Insider

A complete system for scraping, analyzing, and visualizing Swedish public insider transactions from the FI (Finansinspektionen) registry.

## Architecture

```
fi-insider/
├── scraper/       # Node.js scraper → outputs to frontend/public/data/
├── frontend/      # React + Vite + Tailwind CSS dashboard
├── backend/       # Cloudflare Worker config (future API use)
└── .github/       # GitHub Actions for automated daily scraping
```

### Data Flow

1. **Scraper** fetches transactions from FI and writes `transactions.json` directly into `frontend/public/data/`
2. **GitHub Actions** runs the scraper daily at 15:45 UTC (after Swedish market close) and auto-commits updated data
3. **Cloudflare Pages** auto-deploys the frontend on every commit, serving the latest data globally
4. **Cloudflare Access** gates the site behind email OTP (only whitelisted users)

## Local Development

### 1. Scraper
```bash
cd scraper
npm install
npm start
```
The scraper outputs directly to `frontend/public/data/transactions.json` — no manual copy needed.

### 2. Frontend
```bash
cd frontend
yarn install
yarn dev
```
The dashboard runs at `http://localhost:6175`.

## Deployment (Cloudflare Free Tier)

### Frontend → Cloudflare Pages
1. Go to **Cloudflare Dashboard → Pages → Create a project**
2. Connect your GitHub repository
3. Set build command: `cd frontend && yarn install && yarn build`
4. Set output directory: `frontend/dist`
5. Deploy — site will be available at `<project-name>.pages.dev`

### Anti-Abuse → Cloudflare Access
1. Go to **Cloudflare Dashboard → Zero Trust → Access → Applications**
2. Add a Self-hosted Application with your Pages URL
3. Create an Access Policy: Allow → Emails → whitelist your email addresses
4. Auth method: One-time PIN (email OTP)

### Scraper Automation → GitHub Actions
The `.github/workflows/scrape.yml` workflow runs automatically:
- **Schedule:** Weekdays at 15:45 UTC (≈17:45 CEST / 16:45 CET)
- **Manual trigger:** Click "Run workflow" in GitHub → Actions tab
- Each run scrapes FI, commits updated `transactions.json`, and triggers a Cloudflare Pages rebuild

## Features
- **Search & Filter:** Find transactions by company, person, instrument, or role
- **Market Segments:** Fuzzy-matched Large Cap / Mid Cap icons via `lc.log` and `mc.log` lists
- **Calculated Insights:** Auto-computed "Total Value" (volume × price) for spotting significant movements
- **Export Data:** Download your current filtered view as CSV
- **Pagination:** Navigate through large datasets with page controls
