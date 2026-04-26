import { useState, useCallback } from 'react'

export type FetchSource = 'binance-futures' | 'binance-spot'

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

async function fetchBinanceFutures(): Promise<FetchResult> {
  const res = await fetch(
    'https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=1000',
  )
  if (!res.ok) throw new Error(`Binance Futures error: ${res.status}`)

  const json = await res.json()
  if (json.code !== undefined && json.code !== 200) {
    throw new Error(
      json.msg ?? 'Binance Futures no disponible desde tu ubicación',
    )
  }

  return {
    shortPrices: aggregateByStep(json.asks),
    longPrices: aggregateByStep(json.bids),
  }
}

async function fetchBinanceSpot(): Promise<FetchResult> {
  const res = await fetch(
    'https://data-api.binance.vision/api/v3/depth?symbol=BTCUSDT&limit=1000',
  )
  if (!res.ok) throw new Error(`Binance Spot error: ${res.status}`)

  const json = await res.json()
  return {
    shortPrices: aggregateByStep(json.asks),
    longPrices: aggregateByStep(json.bids),
  }
}

const SOURCE_LABELS: Record<FetchSource, string> = {
  'binance-futures': 'Binance Futures',
  'binance-spot': 'Binance Spot',
}

export { SOURCE_LABELS }

export function useOrderBookFetch(source: FetchSource) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchOrderBook = useCallback(async (): Promise<FetchResult | null> => {
    setLoading(true)
    setError(null)

    try {
      if (source === 'binance-futures') {
        return await fetchBinanceFutures()
      }
      return await fetchBinanceSpot()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [source])

  return { fetchOrderBook, loading, error }
}
