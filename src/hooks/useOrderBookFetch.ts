import { useState, useCallback } from 'react'

export interface PriceLevel {
  price: number
  volume: number
}

export interface FetchResult {
  shortPrices: PriceLevel[]
  longPrices: PriceLevel[]
  currentPrice: number
}

interface AggregatedLevel {
  price: number
  qty: number
}

const COUNT = 16

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
  const buckets = new Map<number, number>()

  for (const [priceStr, qtyStr] of levels) {
    const price = parseFloat(priceStr)
    const qty = parseFloat(qtyStr)
    const rounded = Math.round(price / step) * step
    const key = parseFloat(rounded.toPrecision(10))
    buckets.set(key, (buckets.get(key) ?? 0) + qty)
  }

  const sorted: AggregatedLevel[] = []
  for (const [price, qty] of buckets) {
    sorted.push({ price, qty })
  }
  sorted.sort((a, b) => b.qty - a.qty)

  const top = sorted.slice(0, COUNT)
  const maxVol = Math.max(...top.map((l) => l.qty))

  return top
    .sort((a, b) => b.price - a.price)
    .map((l) => ({
      price: l.price,
      volume: maxVol > 0 ? l.qty / maxVol : 0,
    }))
}

export function useOrderBookFetch(symbol: string) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchOrderBook = useCallback(async (): Promise<FetchResult | null> => {
    setLoading(true)
    setError(null)

    try {
      const [depthRes, tickerRes] = await Promise.all([
        fetch(
          `https://data-api.binance.vision/api/v3/depth?symbol=${symbol}&limit=5000`,
        ),
        fetch(
          `https://data-api.binance.vision/api/v3/ticker/price?symbol=${symbol}`,
        ),
      ])

      if (!depthRes.ok) throw new Error(`Binance error: ${depthRes.status}`)

      const depthJson = await depthRes.json()
      const tickerJson = await tickerRes.json()
      const asks: [string, string][] = depthJson.asks
      const bids: [string, string][] = depthJson.bids

      const askStep = calcStep(asks)
      const bidStep = calcStep(bids)

      return {
        shortPrices: aggregateByStep(asks, askStep),
        longPrices: aggregateByStep(bids, bidStep),
        currentPrice: parseFloat(tickerJson.price),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [symbol])

  return { fetchOrderBook, loading, error }
}
