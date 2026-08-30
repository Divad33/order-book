import { useState, useEffect, useCallback, useRef } from 'react'
import { CandlestickChart } from './CandlestickChart'
import type { Kline, OverlayLine, ActiveOrder } from './CandlestickChart'
import { IconRefresh } from './Icons'
import type { DataSource } from '../hooks/useOrderBookFetch'

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const
type Interval = (typeof INTERVALS)[number]

const INTERVAL_LABELS: Record<Interval, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1D',
}

interface ChartScreenProps {
  symbol: string
  onClose: () => void
  embedded?: boolean
  overlayLines?: OverlayLine[]
  dataSourceLabel?: string
  activeOrder?: ActiveOrder | null
  fundingRate?: number | null
  dataSource?: DataSource
}

export function ChartScreen({ symbol, onClose, embedded, overlayLines, dataSourceLabel, activeOrder, fundingRate, dataSource = 'spot' }: ChartScreenProps) {
  const [interval, setInterval_] = useState<Interval>(() => {
    const saved = localStorage.getItem('ob_chartInterval')
    return (saved && INTERVALS.includes(saved as Interval)) ? saved as Interval : '1h'
  })
  const [klines, setKlines] = useState<Kline[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastPrice, setLastPrice] = useState<number | null>(null)
  const [priceChange, setPriceChange] = useState<number | null>(null)
  const [isLandscape, setIsLandscape] = useState(false)
  const [isLive, setIsLive] = useState(false)

  const base = symbol.replace('USDT', '')
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataSourceRef = useRef(dataSource)

  useEffect(() => { dataSourceRef.current = dataSource }, [dataSource])

  useEffect(() => {
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const fetchKlines = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const src = dataSourceRef.current
      const baseUrl = src === 'futures'
        ? 'https://fapi.binance.com/fapi/v1/klines'
        : 'https://data-api.binance.vision/api/v3/klines'
      const res = await fetch(`${baseUrl}?symbol=${symbol}&interval=${interval}&limit=200`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: unknown[][] = await res.json()
      const parsed: Kline[] = data.map((d) => ({
        time: d[0] as number, open: parseFloat(d[1] as string),
        high: parseFloat(d[2] as string), close: parseFloat(d[4] as string),
        low: parseFloat(d[3] as string), volume: parseFloat(d[5] as string),
      }))
      setKlines(parsed)
      if (parsed.length >= 2) {
        const last = parsed[parsed.length - 1], first = parsed[0]
        setLastPrice(last.close)
        setPriceChange(((last.close - first.open) / first.open) * 100)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally { setLoading(false) }
  }, [symbol, interval])

  const connectWebSocket = useCallback(() => {
    // Limpiar reconexiones anteriores
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }

    const symLower = symbol.toLowerCase()
    const src = dataSourceRef.current
    const wsUrl = src === 'futures'
      ? `wss://fstream.binance.com/ws/${symLower}@kline_${interval}`
      : `wss://data-stream.binance.vision/ws/${symLower}@kline_${interval}`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    ws.onopen = () => { setIsLive(true); setError(null) }
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data), k = msg.k
      const newKline: Kline = {
        time: k.t, open: parseFloat(k.o), high: parseFloat(k.h),
        low: parseFloat(k.l), close: parseFloat(k.c), volume: parseFloat(k.v),
      }
      setLastPrice(newKline.close)
      setKlines((prev) => {
        if (prev.length === 0) return [newKline]
        const lastIdx = prev.length - 1
        if (prev[lastIdx].time === newKline.time) {
          const updated = [...prev]; updated[lastIdx] = newKline; return updated
        }
        if (k.x && newKline.time > prev[lastIdx].time) {
          const next = [...prev, newKline]
          if (next.length > 200) next.shift()
          return next
        }
        return prev
      })
    }
    ws.onerror = () => { setError('Error WS'); setIsLive(false) }
    ws.onclose = () => {
      setIsLive(false)
      reconnectTimeoutRef.current = setTimeout(() => connectWebSocket(), 3000)
    }
  }, [symbol, interval])

  useEffect(() => { localStorage.setItem('ob_chartInterval', interval) }, [interval])

  useEffect(() => {
    fetchKlines().then(() => connectWebSocket())
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    }
  }, [symbol, interval, fetchKlines, connectWebSocket])

  const changeUp = priceChange !== null && priceChange >= 0

  const liveBadge = (
    <div className="flex items-center gap-1 ml-1">
      <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
      <span className={`text-[8px] ${isLive ? 'text-green-400' : 'text-red-400'}`}>{isLive ? 'LIVE' : 'OFF'}</span>
    </div>
  )

  if (isLandscape) {
    return (
      <div className="fixed inset-0 bg-[#0f1729] z-[100] flex flex-col">
        <div className="flex items-center gap-2 px-2 py-1" style={{ backgroundColor: '#1a1f2e' }}>
          <span className="text-white font-bold text-xs">{base}/USDT</span>
          {lastPrice !== null && <span className="text-white text-xs font-mono">${lastPrice >= 1 ? lastPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : lastPrice.toPrecision(5)}</span>}
          {priceChange !== null && <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full ${changeUp ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>{changeUp ? '+' : ''}{priceChange.toFixed(2)}%</span>}
          {fundingRate !== null && fundingRate !== undefined && <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full ${fundingRate >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>FR: {fundingRate >= 0 ? '+' : ''}{(fundingRate * 100).toFixed(4)}%</span>}
          {liveBadge}
          <div className="flex-1" />
          <div className="flex gap-1">
            {INTERVALS.map((iv) => <button key={iv} onClick={() => setInterval_(iv)} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${interval === iv ? 'bg-yellow-500 text-black' : 'text-gray-500'}`}>{INTERVAL_LABELS[iv]}</button>)}
          </div>
          <button onClick={fetchKlines} className="p-1 rounded-full bg-gray-700/50 text-gray-400"><IconRefresh size={12} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        <CandlestickChart klines={klines} symbol={symbol} overlayLines={overlayLines} activeOrder={activeOrder} />
      </div>
    )
  }

  const wrapperClass = embedded ? 'flex-1 flex flex-col bg-[#141821]' : 'fixed inset-0 bg-[#141821] z-50 flex flex-col'

  return (
    <div className={wrapperClass}>
      <div className="bg-[#1a1f2e] px-3 py-2.5 flex items-center gap-2">
        {!embedded && <button onClick={onClose} className="text-gray-400 hover:text-white text-lg px-1">←</button>}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-sm">{base}/USDT</span>
            {lastPrice !== null && <span className="text-white text-sm font-mono tabular-nums">${lastPrice >= 1 ? lastPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : lastPrice.toPrecision(5)}</span>}
            {priceChange !== null && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${changeUp ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>{changeUp ? '+' : ''}{priceChange.toFixed(2)}%</span>}
            {fundingRate !== null && fundingRate !== undefined && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${fundingRate >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>FR: {fundingRate >= 0 ? '+' : ''}{(fundingRate * 100).toFixed(4)}%</span>}
            {liveBadge}
          </div>
        </div>
        <button onClick={fetchKlines} className="p-1.5 rounded-full bg-gray-700/50 text-gray-400 active:bg-gray-600/50"><IconRefresh size={16} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <div className="bg-[#1a1f2e]/50 px-3 py-1.5 flex gap-1.5">
        {INTERVALS.map((iv) => <button key={iv} onClick={() => setInterval_(iv)} className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-colors ${interval === iv ? 'bg-yellow-500 text-black' : 'bg-[#1e2536] text-gray-500 active:text-white'}`}>{INTERVAL_LABELS[iv]}</button>)}
      </div>

      {error && <div className="text-red-400 text-center py-4 text-sm">{error}</div>}
      {loading && klines.length === 0 ? <div className="flex-1 flex items-center justify-center text-gray-500">Cargando gráfico...</div> : <CandlestickChart klines={klines} symbol={symbol} overlayLines={overlayLines} activeOrder={activeOrder} />}

      <div className="bg-[#1a1f2e] px-3 py-1.5 flex items-center justify-between text-[10px] text-gray-600">
        <span>Binance {dataSourceLabel || 'Spot'} {isLive ? '• WebSocket' : '• Desconectado'}</span>
        <span className="text-[9px] text-gray-700">Gira el teléfono para pantalla completa</span>
      </div>
    </div>
  )
}
