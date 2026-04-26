import { useState, useCallback } from 'react'

export type FetchSource = 'binance-futures' | 'binance-spot' | 'okx'

interface FetchResult {
  shortPrices: number[]
  longPrices: number[]
}

interface AggregatedLevel {
  price: number
  qty: number
}

function aggregateByStep(
  levels: [string, string][],
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

async function fetchBinanceFutures(): Promise<FetchResult> {
  const res = await fetch(
    'https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=500',
  )
  if (!res.ok) throw new Error(`Binance Futures error: ${res.status}`)

  const json = await res.json()
  if (json.code !== undefined && json.code !== 200) {
    throw new Error(json.msg ?? 'Binance Futures no disponible desde tu ubicación')
  }

  return {
    shortPrices: aggregateByStep(json.asks, 100, 16),
    longPrices: aggregateByStep(json.bids, 100, 16),
  }
}

async function fetchBinanceSpot(): Promise<FetchResult> {
  const res = await fetch(
    'https://data-api.binance.vision/api/v3/depth?symbol=BTCUSDT&limit=1000',
  )
  if (!res.ok) throw new Error(`Binance Spot error: ${res.status}`)

  const json = await res.json()
  return {
    shortPrices: aggregateByStep(json.asks, 100, 16),
    longPrices: aggregateByStep(json.bids, 100, 16),
  }
}

async function fetchOkx(): Promise<FetchResult> {
  const res = await fetch(
    'https://www.okx.com/api/v5/market/books?instId=BTC-USDT-SWAP&sz=200',
  )
  if (!res.ok) throw new Error(`OKX error: ${res.status}`)

  const json = await res.json()
  if (json.code !== '0') throw new Error(`OKX: ${json.msg}`)

  const { asks, bids } = json.data[0]
  return {
    shortPrices: aggregateByStep(asks, 100, 16),
    longPrices: aggregateByStep(bids, 100, 16),
  }
}

const SOURCE_LABELS: Record<FetchSource, string> = {
  'binance-futures': 'Binance Futures',
  'binance-spot': 'Binance Spot',
  'okx': 'OKX Futures',
}

export { SOURCE_LABELS }

export function useOrderBookFetch(source: FetchSource) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchOrderBook = useCallback(async (): Promise<FetchResult | null> => {
    setLoading(true)
    setError(null)

    try {
      switch (source) {
        case 'binance-futures':
          return await fetchBinanceFutures()
        case 'binance-spot':
          return await fetchBinanceSpot()
        case 'okx':
          return await fetchOkx()
      }
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
