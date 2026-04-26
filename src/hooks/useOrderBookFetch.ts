import { useState, useCallback } from 'react'

interface FetchResult {
  shortPrices: number[]
  longPrices: number[]
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

  // step ≈ 0.01% of mid price, rounded to a clean number
  const raw = mid * 0.0001
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  return Math.max(mag, Number.EPSILON)
}

function aggregateByStep(
  levels: [string, string][],
  step: number,
): number[] {
  const buckets = new Map<number, number>()

  for (const [priceStr, qtyStr] of levels) {
    const price = parseFloat(priceStr)
    const qty = parseFloat(qtyStr)
    const rounded = Math.round(price / step) * step
    // keep precision clean
    const key = parseFloat(rounded.toPrecision(10))
    buckets.set(key, (buckets.get(key) ?? 0) + qty)
  }

  const sorted: AggregatedLevel[] = []
  for (const [price, qty] of buckets) {
    sorted.push({ price, qty })
  }
  sorted.sort((a, b) => b.qty - a.qty)

  return sorted
    .slice(0, COUNT)
    .map((l) => l.price)
    .sort((a, b) => b - a)
}

export function useOrderBookFetch(symbol: string) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchOrderBook = useCallback(async (): Promise<FetchResult | null> => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(
        `https://data-api.binance.vision/api/v3/depth?symbol=${symbol}&limit=5000`,
      )
      if (!res.ok) throw new Error(`Binance error: ${res.status}`)

      const json = await res.json()
      const asks: [string, string][] = json.asks
      const bids: [string, string][] = json.bids

      const askStep = calcStep(asks)
      const bidStep = calcStep(bids)

      return {
        shortPrices: aggregateByStep(asks, askStep),
        longPrices: aggregateByStep(bids, bidStep),
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
