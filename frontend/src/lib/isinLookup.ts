const LARGE_CAP_SEK = 11_000_000_000
const MID_CAP_SEK = 1_700_000_000

export type CapTier = 'Large' | 'Mid' | 'Small' | 'unknown'

export interface IsinInfo {
    isin: string
    yahoo_ticker: string | null
    market_cap_sek: number | null
    cap_tier: CapTier
    yahoo_url: string | null
    avanza_url: string | null
}

let isinToTicker: Record<string, string | null> = {}
let tickerToMarketCap: Record<string, number | null> = {}
let _loaded = false

export async function loadIsinData(): Promise<void> {
    if (_loaded) return
    const [tickerRes, mcapRes] = await Promise.allSettled([
        fetch('/data/isin_ticker.json'),
        fetch('/data/isin_marketcap.json'),
    ])
    if (tickerRes.status === 'fulfilled' && tickerRes.value.ok) {
        isinToTicker = await tickerRes.value.json()
    }
    if (mcapRes.status === 'fulfilled' && mcapRes.value.ok) {
        tickerToMarketCap = await mcapRes.value.json()
    }
    _loaded = true
}

export function getCapTier(marketCap: number | null): CapTier {
    if (marketCap === null || marketCap === undefined) return 'unknown'
    if (marketCap >= LARGE_CAP_SEK) return 'Large'
    if (marketCap >= MID_CAP_SEK) return 'Mid'
    return 'Small'
}

export function lookupIsin(isin: string): IsinInfo {
    const yahoo_ticker = (isin ? isinToTicker[isin] : undefined) ?? null
    const market_cap_sek = yahoo_ticker !== null ? (tickerToMarketCap[yahoo_ticker] ?? null) : null
    const cap_tier = getCapTier(market_cap_sek)
    return {
        isin,
        yahoo_ticker,
        market_cap_sek,
        cap_tier,
        yahoo_url: yahoo_ticker ? `https://finance.yahoo.com/quote/${yahoo_ticker}` : null,
        avanza_url: yahoo_ticker ? `https://www.avanza.se/aktier/lista.html?search=${yahoo_ticker.replace('.ST', '')}` : null,
    }
}
