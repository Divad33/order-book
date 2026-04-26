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

  return sorted.slice(0, count).map((l) => l.price).sort((a, b) => b - a)
}

export type FetchSource = 'okx' | 'coinglass'

interface UseOrderBookFetchOptions {
  source: FetchSource
  coinglassApiKey?: string
}

export function useOrderBookFetch({ source, coinglassApiKey }: UseOrderBookFetchOptions) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchOrderBook = useCallback(async (): Promise<FetchResult | null> => {
    setLoading(true)
    setError(null)

    try {
      if (source === 'coinglass' && coinglassApiKey) {
        return await fetchFromCoinglass(coinglassApiKey)
      }
      return await fetchFromOkx()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [source, coinglassApiKey])

  return { fetchOrderBook, loading, error }
}

async function fetchFromOkx(): Promise<FetchResult> {
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
}

async function fetchFromCoinglass(apiKey: string): Promise<FetchResult> {
  const res = await fetch(
    'https://open-api-v4.coinglass.com/api/futures/orderbook/large-limit-order?exchange=Binance&symbol=BTCUSDT',
    {
      headers: {
        'CG-API-KEY': apiKey,
        accept: 'application/json',
      },
    },
  )
  if (!res.ok) throw new Error(`CoinGlass API error: ${res.status}`)

  const json = await res.json()
  if (json.code !== '0') throw new Error(`CoinGlass: ${json.msg}`)

  const asks: number[] = []
  const bids: number[] = []

  for (const order of json.data ?? []) {
    const price = Math.round(parseFloat(order.price) / 100) * 100
    if (order.side === 'sell' || order.side === 'ask') {
      if (!asks.includes(price)) asks.push(price)
    } else {
      if (!bids.includes(price)) bids.push(price)
    }
  }

  asks.sort((a, b) => b - a)
  bids.sort((a, b) => b - a)

  return {
    shortPrices: asks.slice(0, 16),
    longPrices: bids.slice(0, 16),
  }
}
