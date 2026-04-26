import { useState, useCallback } from 'react'

interface FetchResult {
  shortPrices: number[]
  longPrices: number[]
}

interface AggregatedLevel {
  price: number
  qty: number
}

const STEP = 10
const COUNT = 16

function aggregateByStep(levels: [string, string][]): number[] {
  const buckets = new Map<number, number>()

  for (const [priceStr, qtyStr] of levels) {
    const price = parseFloat(priceStr)
    const qty = parseFloat(qtyStr)
    const rounded = Math.round(price / STEP) * STEP
    buckets.set(rounded, (buckets.get(rounded) ?? 0) + qty)
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

export function useOrderBookFetch() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchOrderBook = useCallback(async (): Promise<FetchResult | null> => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(
        'https://data-api.binance.vision/api/v3/depth?symbol=BTCUSDT&limit=1000',
      )
      if (!res.ok) throw new Error(`Binance error: ${res.status}`)

      const json = await res.json()
      return {
        shortPrices: aggregateByStep(json.asks),
        longPrices: aggregateByStep(json.bids),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { fetchOrderBook, loading, error }
}
