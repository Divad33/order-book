import { useState, useEffect, useCallback, useRef } from 'react'
import { CandlestickChart } from './CandlestickChart'
import type { Kline } from './CandlestickChart'

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const
type Interval = (typeof INTERVALS)[number]

const INTERVAL_LABELS: Record<Interval, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1H',
  '4h': '4H',
  '1d': '1D',
}

interface ChartScreenProps {
  symbol: string
  onClose: () => void
}

export function ChartScreen({ symbol, onClose }: ChartScreenProps) {
  const [interval, setInterval_] = useState<Interval>('1h')
  const [klines, setKlines] = useState<Kline[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastPrice, setLastPrice] = useState<number | null>(null)
  const [priceChange, setPriceChange] = useState<number | null>(null)

  const base = symbol.replace('USDT', '')

  const fetchKlines = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=200`,
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: unknown[][] = await res.json()

      const parsed: Kline[] = data.map((d) => ({
        time: d[0] as number,
        open: parseFloat(d[1] as string),
        high: parseFloat(d[2] as string),
        close: parseFloat(d[4] as string),
        low: parseFloat(d[3] as string),
        volume: parseFloat(d[5] as string),
      }))

      setKlines(parsed)

      if (parsed.length >= 2) {
        const last = parsed[parsed.length - 1]
        const first = parsed[0]
        setLastPrice(last.close)
        setPriceChange(((last.close - first.open) / first.open) * 100)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [symbol, interval])

  const fetchRef = useRef(fetchKlines)
  useEffect(() => {
    fetchRef.current = fetchKlines
  }, [fetchKlines])

  useEffect(() => {
    const initTimer = setTimeout(() => fetchRef.current(), 0)
    const timer = setInterval(() => fetchRef.current(), 30000)
    return () => {
      clearTimeout(initTimer)
      clearInterval(timer)
    }
  }, [interval])

  const changeUp = priceChange !== null && priceChange >= 0

  return (
    <div className="fixed inset-0 bg-[#0f1729] z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-3 py-2 flex items-center gap-2">
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-lg px-1"
        >
          ←
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-sm">
              {base}/USDT
            </span>
            {lastPrice !== null && (
              <span className="text-white text-sm font-mono">
                ${lastPrice >= 1
                  ? lastPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })
                  : lastPrice.toPrecision(5)}
              </span>
            )}
            {priceChange !== null && (
              <span
                className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                  changeUp
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                {changeUp ? '+' : ''}
                {priceChange.toFixed(2)}%
              </span>
            )}
          </div>
        </div>
        <button
          onClick={fetchKlines}
          className={`text-gray-400 hover:text-white text-sm px-2 py-1 rounded ${
            loading ? 'animate-spin' : ''
          }`}
        >
          ⟳
        </button>
      </div>

      {/* Timeframe selector */}
      <div className="bg-gray-900/50 px-2 py-1.5 flex gap-1 border-b border-gray-800">
        {INTERVALS.map((iv) => (
          <button
            key={iv}
            onClick={() => setInterval_(iv)}
            className={`flex-1 text-xs font-bold py-1.5 rounded transition-colors ${
              interval === iv
                ? 'bg-yellow-500 text-black'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {INTERVAL_LABELS[iv]}
          </button>
        ))}
      </div>

      {/* Chart area */}
      {error && (
        <div className="text-red-400 text-center py-4 text-sm">{error}</div>
      )}
      {loading && klines.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          Cargando gráfico...
        </div>
      ) : (
        <CandlestickChart klines={klines} symbol={symbol} />
      )}

      {/* Bottom info bar */}
      <div className="bg-gray-900 border-t border-gray-800 px-3 py-1.5 flex items-center justify-between text-xs text-gray-500">
        <span>{klines.length} velas</span>
        <span>Binance Spot</span>
      </div>
    </div>
  )
}
