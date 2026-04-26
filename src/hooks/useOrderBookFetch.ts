import { useState, useCallback } from 'react'

interface FetchResult {
  shortPrices: number[]
  longPrices: number[]
}

interface AggregatedLevel {
  price: number
  qty: number
}

function aggregateByStep(
  levels: [string, string, string, string][],
  step: number,
  count: number,
): number[] {
  const buckets = new Map<number, number>()

  for (const [priceStr, qtyStr] of levels) {
    const price = parseFloat(priceStr)
    const qty = parseFloat(qtyStr)
    const rounded = Math.round(price / step) * step
    buckets.set(rounded, (buckets.get(rounded) ?? 0) + qty)
  }

  const sorted: AggregatedLevel[] = []
  for (const [price, qty] of buckets) {
    sorted.push({ price, qty })
  }
  sorted.sort((a, b) => b.qty - a.qty)

  return sorted
    .slice(0, count)
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
        'https://www.okx.com/api/v5/market/books?instId=BTC-USDT-SWAP&sz=200',
      )
      if (!res.ok) throw new Error(`OKX API error: ${res.status}`)

      const json = await res.json()
      if (json.code !== '0') throw new Error(`OKX: ${json.msg}`)

      const { asks, bids } = json.data[0]

      const shortPrices = aggregateByStep(asks, 100, 16)
      const longPrices = aggregateByStep(bids, 100, 16)

      return { shortPrices, longPrices }
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
