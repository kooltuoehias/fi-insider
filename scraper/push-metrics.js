import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '../frontend/public/data')

// ── Minimal Protobuf encoder for Prometheus WriteRequest ─────────
// Schema: WriteRequest { repeated TimeSeries timeseries = 1; }
//         TimeSeries  { repeated Label labels = 1; repeated Sample samples = 2; }
//         Label       { string name = 1; string value = 2; }
//         Sample      { double value = 1; int64 timestamp = 2; }

function varint(n) {
  n = BigInt(Math.round(n))
  const out = []
  while (n >= 128n) {
    out.push(Number(n & 0x7fn) | 0x80)
    n >>= 7n
  }
  out.push(Number(n))
  return Buffer.from(out)
}

function lengthDelimited(fieldNum, bytes) {
  return Buffer.concat([varint((fieldNum << 3) | 2), varint(bytes.length), bytes])
}

function stringField(fieldNum, str) {
  return lengthDelimited(fieldNum, Buffer.from(str, 'utf8'))
}

function doubleField(fieldNum, val) {
  const b = Buffer.allocUnsafe(8)
  b.writeDoubleLE(val, 0)
  return Buffer.concat([varint((fieldNum << 3) | 1), b])
}

function encodeLabel({ name, value }) {
  return Buffer.concat([stringField(1, name), stringField(2, value)])
}

function encodeSample({ value, timestamp }) {
  return Buffer.concat([
    doubleField(1, value),
    Buffer.concat([varint((2 << 3) | 0), varint(timestamp)]),
  ])
}

function encodeTimeSeries({ labels, samples }) {
  return Buffer.concat([
    ...labels.map(l => lengthDelimited(1, encodeLabel(l))),
    ...samples.map(s => lengthDelimited(2, encodeSample(s))),
  ])
}

function encodeWriteRequest(timeseries) {
  return Buffer.concat(timeseries.map(ts => lengthDelimited(1, encodeTimeSeries(ts))))
}

// ── Minimal Snappy block encoder (all-literal, no compression) ───
// Valid snappy format: every byte is output as a literal run.
// Grafana Cloud decompresses correctly; compression ratio doesn't matter.

function snappyEncode(input) {
  const parts = [varint(input.length)]
  for (let i = 0; i < input.length; i += 60) {
    const chunk = input.slice(i, i + 60)
    parts.push(Buffer.from([((chunk.length - 1) << 2) | 0x00]))
    parts.push(Buffer.from(chunk))
  }
  return Buffer.concat(parts)
}

// ── Domain helpers ───────────────────────────────────────────────

const LARGE_CAP = 11_000_000_000
const MID_CAP   =  1_700_000_000

function capTier(mcap) {
  if (!mcap) return 'unknown'
  if (mcap >= LARGE_CAP) return 'large_cap'
  if (mcap >= MID_CAP)   return 'mid_cap'
  return 'small_cap'
}

function signalGrade(v) {
  if (v >= 1_000_000) return 'table_pounding'
  if (v >=   500_000) return 'conviction'
  if (v >=   200_000) return 'watch'
  return 'token'
}

function parseDate(s) {
  if (!s) return null
  const [dd, mm, yy] = s.split('/')
  return new Date(+yy, +mm - 1, +dd)
}

function daysSince(d) {
  return (Date.now() - d.getTime()) / 86_400_000
}

function makeSeries(name, labels, value, ts) {
  return {
    labels: [
      { name: '__name__', value: name },
      ...Object.entries(labels).map(([k, v]) => ({ name: k, value: String(v) })),
    ],
    samples: [{ value, timestamp: ts }],
  }
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  const { GRAFANA_REMOTE_WRITE_URL: url, GRAFANA_METRICS_USER: user, GRAFANA_METRICS_PASSWORD: pass } = process.env
  if (!url || !user || !pass) {
    console.error('Missing env: GRAFANA_REMOTE_WRITE_URL / GRAFANA_METRICS_USER / GRAFANA_METRICS_PASSWORD')
    process.exit(1)
  }

  const isinToTicker   = fs.readJsonSync(path.join(DATA_DIR, 'isin_ticker.json'))
  const tickerToMcap   = fs.readJsonSync(path.join(DATA_DIR, 'isin_marketcap.json'))
  const sectorFile     = path.join(DATA_DIR, 'ticker_sector.json')
  const tickerToSector = fs.existsSync(sectorFile) ? fs.readJsonSync(sectorFile) : {}

  // Load all year files
  const allTx = []
  for (let y = 2016; y <= new Date().getFullYear(); y++) {
    const f = path.join(DATA_DIR, `transactions_${y}.json`)
    if (fs.existsSync(f)) allTx.push(...fs.readJsonSync(f))
  }

  // Enrich raw transactions
  const enriched = allTx.map(t => {
    const totalValue = (t.volume || 0) * (t.price || 0)
    const ticker     = isinToTicker[t.isin] ?? null
    const mcap       = ticker ? (tickerToMcap[ticker] ?? null) : null
    return {
      ...t,
      totalValue,
      capTier: capTier(mcap),
      sector:  ticker ? (tickerToSector[ticker] || 'Unknown') : 'Unknown',
      grade:   t.nature?.includes('Acquisition') ? signalGrade(totalValue) : null,
      date:    parseDate(t.transactionDate || t.publicationDate),
    }
  })

  const acq30 = enriched.filter(t => t.nature?.includes('Acquisition') && t.date && daysSince(t.date) <= 30)
  const acq90 = enriched.filter(t => t.nature?.includes('Acquisition') && t.date && daysSince(t.date) <= 90)

  // Buys count by segment × grade (30d)
  const bySegGrade = {}
  for (const t of acq30) {
    const k = `${t.capTier}||${t.grade}`
    bySegGrade[k] = (bySegGrade[k] || 0) + 1
  }

  // Buy volume by segment (30d)
  const volBySeg = {}
  for (const t of acq30) {
    volBySeg[t.capTier] = (volBySeg[t.capTier] || 0) + t.totalValue
  }

  // Buys by sector (30d)
  const bySector = {}
  for (const t of acq30) {
    bySector[t.sector] = (bySector[t.sector] || 0) + 1
  }

  // Active clusters: 2+ distinct insiders buying same stock within 30d
  const stockPersons = {}
  for (const t of acq30) {
    const k = t.isin || t.issuer
    if (!stockPersons[k]) stockPersons[k] = new Set()
    stockPersons[k].add(t.person)
  }
  const clusterCount = Object.values(stockPersons).filter(s => s.size >= 2).length

  // CEO+CFO alerts: both roles buy same stock within 90d (must be different people)
  const ceoCfoMap = {}
  for (const t of acq90) {
    const k = t.isin || t.issuer
    if (!ceoCfoMap[k]) ceoCfoMap[k] = { ceo: new Set(), cfo: new Set() }
    if (t.position?.includes('Chief Executive Officer')) ceoCfoMap[k].ceo.add(t.person)
    if (t.position?.includes('Chief Financial Officer')) ceoCfoMap[k].cfo.add(t.person)
  }
  const ceoCfoCount = Object.values(ceoCfoMap).filter(v =>
    v.ceo.size > 0 && v.cfo.size > 0 && ![...v.ceo].some(p => v.cfo.has(p))
  ).length

  // Build Prometheus time series
  const now = Date.now()
  const series = []

  for (const [k, count] of Object.entries(bySegGrade)) {
    const [segment, grade] = k.split('||')
    series.push(makeSeries('fi_insider_buys_count', { segment, grade }, count, now))
  }
  for (const [segment, vol] of Object.entries(volBySeg)) {
    series.push(makeSeries('fi_insider_buy_volume_sek', { segment }, vol, now))
  }
  for (const [sector, count] of Object.entries(bySector)) {
    const sectorKey = sector.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    series.push(makeSeries('fi_insider_buys_by_sector', { sector: sectorKey }, count, now))
  }
  series.push(makeSeries('fi_insider_clusters_active',    {}, clusterCount,  now))
  series.push(makeSeries('fi_insider_ceo_cfo_alerts',     {}, ceoCfoCount,   now))
  series.push(makeSeries('fi_insider_transactions_total', {}, allTx.length,  now))

  console.log(`Pushing ${series.length} metric series to Grafana Cloud…`)

  const encoded    = encodeWriteRequest(series)
  const compressed = snappyEncode(encoded)
  const auth       = Buffer.from(`${user}:${pass}`).toString('base64')

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-protobuf',
      'Content-Encoding': 'snappy',
      'X-Prometheus-Remote-Write-Version': '0.1.0',
      Authorization: `Basic ${auth}`,
    },
    body: compressed,
  })

  if (!resp.ok) {
    throw new Error(`Remote write failed: ${resp.status} — ${await resp.text()}`)
  }
  console.log(`✓ Pushed ${series.length} series successfully`)
}

main().catch(err => { console.error(err.message); process.exit(1) })
