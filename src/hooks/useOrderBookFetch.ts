import { useState, useCallback } from 'react'

export type DataSource = 'spot' | 'futures'

export interface PriceLevel {
  price: number
  volume: number      // normalizado 0-1 (relativo al max del top 16)
  rawVolume: number   // volumen real en moneda base (qty)
  usdtVolume: number  // volumen aproximado en USDT (qty * price)
}

export interface FetchResult {
  shortPrices: PriceLevel[]
  longPrices: PriceLevel[]
  currentPrice: number
  totalShortVol: number   // total USDT en asks
  totalLongVol: number    // total USDT en bids
}

interface AggregatedLevel {
  price: number
  qty: number
  usdt: number
}

const COUNT = 16

const SPOT_DEPTH = 'https://data-api.binance.vision/api/v3/depth'
const SPOT_TICKER = 'https://data-api.binance.vision/api/v3/ticker/price'
const FUTURES_DEPTH = 'https://fapi.binance.com/fapi/v1/depth'
const FUTURES_TICKER = 'https://fapi.binance.com/fapi/v1/ticker/price'

function calcStep(levels: [string, string][]): number {
  if (levels.length < 2) return 1
  const prices = levels.map(([p]) => parseFloat(p))
  const mid = (prices[0] + prices[prices.length - 1]) / 2
  if (mid <= 0) return 1

  const raw = mid * 0.0001
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  return Math.max(mag, Number.EPSILON)
}

function aggregateByStep(
  levels: [string, string][],
  step: number,
): PriceLevel[] {
  const buckets = new Map<number, AggregatedLevel>()

  for (const [priceStr, qtyStr] of levels) {
    const price = parseFloat(priceStr)
    const qty = parseFloat(qtyStr)
    const rounded = Math.round(price / step) * step
    const key = parseFloat(rounded.toPrecision(10))
    const existing = buckets.get(key)
    if (existing) {
      existing.qty += qty
      existing.usdt += qty * price
    } else {
      buckets.set(key, { price: key, qty, usdt: qty * price })
    }
  }

  const sorted: AggregatedLevel[] = Array.from(buckets.values())
  sorted.sort((a, b) => b.qty - a.qty)

  const top = sorted.slice(0, COUNT)
  const maxVol = Math.max(...top.map((l) => l.qty), 1)
  const totalUsdt = top.reduce((sum, l) => sum + l.usdt, 0)

  return top
    .sort((a, b) => b.price - a.price)
    .map((l) => ({
      price: l.price,
      volume: maxVol > 0 ? l.qty / maxVol : 0,
      rawVolume: l.qty,
      usdtVolume: l.usdt,
    })),
    // totalUsdt no se usa aquí directamente, se calcula fuera
}

export function useOrderBookFetch(symbol: string, source: DataSource) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchOrderBook = useCallback(async (): Promise<FetchResult | null> => {
    setLoading(true)
    setError(null)

    const depthUrl = source === 'futures'
      ? `${FUTURES_DEPTH}?symbol=${symbol}&limit=1000`
      : `${SPOT_DEPTH}?symbol=${symbol}&limit=1000`  // FIX: 5000 no soportado sin auth, usar 1000
    const tickerUrl = source === 'futures'
      ? `${FUTURES_TICKER}?symbol=${symbol}`
      : `${SPOT_TICKER}?symbol=${symbol}`

    try {
      const [depthRes, tickerRes] = await Promise.all([
        fetch(depthUrl),
        fetch(tickerUrl),
      ])

      if (!depthRes.ok) throw new Error(`Binance ${source} error: ${depthRes.status}`)

      const depthJson = await depthRes.json()
      const tickerJson = await tickerRes.json()
      const asks: [string, string][] = depthJson.asks
      const bids: [string, string][] = depthJson.bids

      const askStep = calcStep(asks)
      const bidStep = calcStep(bids)

      const shortPrices = aggregateByStep(asks, askStep)
      const longPrices = aggregateByStep(bids, bidStep)

      const totalShortVol = shortPrices.reduce((a, b) => a + b.usdtVolume, 0)
      const totalLongVol = longPrices.reduce((a, b) => a + b.usdtVolume, 0)

      return {
        shortPrices,
        longPrices,
        currentPrice: parseFloat(tickerJson.price),
        totalShortVol,
        totalLongVol,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [symbol, source])

  return { fetchOrderBook, loading, error }
}
