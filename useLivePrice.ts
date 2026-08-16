import { useState, useEffect, useRef, useCallback } from 'react'

export interface TickerData {
  price: number
  priceChange: number
  priceChangePercent: number
  highPrice: number
  lowPrice: number
  volume: number
  quoteVolume: number
  lastUpdateId: number
}

export function useLivePrice(symbol: string) {
  const [ticker, setTicker] = useState<TickerData | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [wsError, setWsError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const symbolRef = useRef(symbol)

  useEffect(() => { symbolRef.current = symbol }, [symbol])

  const connect = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    const sym = symbolRef.current.toLowerCase()
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${sym}@ticker`)
    wsRef.current = ws
    ws.onopen = () => { setIsConnected(true); setWsError(null) }
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data)
      setTicker({
        price: parseFloat(d.c), priceChange: parseFloat(d.p),
        priceChangePercent: parseFloat(d.P), highPrice: parseFloat(d.h),
        lowPrice: parseFloat(d.l), volume: parseFloat(d.v),
        quoteVolume: parseFloat(d.q), lastUpdateId: d.u,
      })
    }
    ws.onerror = () => { setWsError('Error'); setIsConnected(false) }
    ws.onclose = () => { setIsConnected(false); reconnectTimeoutRef.current = setTimeout(connect, 3000) }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
    }
  }, [symbol, connect])

  return { ticker, isConnected, wsError }
}
 
