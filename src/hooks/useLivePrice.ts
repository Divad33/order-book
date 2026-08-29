import { useState, useEffect, useRef, useCallback } from 'react'
import type { DataSource } from './useOrderBookFetch'

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

export function useLivePrice(symbol: string, source: DataSource = 'spot') {
  const [ticker, setTicker] = useState<TickerData | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [wsError, setWsError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const symbolRef = useRef(symbol)
  const sourceRef = useRef(source)

  useEffect(() => { symbolRef.current = symbol }, [symbol])
  useEffect(() => { sourceRef.current = source }, [source])

  const connect = useCallback(() => {
    // Limpiar timeout anterior para evitar múltiples reconexiones huérfanas
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    const sym = symbolRef.current.toLowerCase()
    const src = sourceRef.current
    const wsUrl = src === 'futures'
      ? `wss://fstream.binance.com/ws/${sym}@ticker`
      : `wss://stream.binance.com:9443/ws/${sym}@ticker`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => { setIsConnected(true); setWsError(null) }
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data)
      setTicker({
        price: parseFloat(d.c),
        priceChange: parseFloat(d.p),
        priceChangePercent: parseFloat(d.P),
        highPrice: parseFloat(d.h),
        lowPrice: parseFloat(d.l),
        volume: parseFloat(d.v),
        quoteVolume: parseFloat(d.q),
        lastUpdateId: d.u,
      })
    }
    ws.onerror = () => { setWsError('Error de conexión WebSocket'); setIsConnected(false) }
    ws.onclose = () => {
      setIsConnected(false)
      reconnectTimeoutRef.current = setTimeout(connect, 3000)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [symbol, source, connect])

  return { ticker, isConnected, wsError }
}
