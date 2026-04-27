import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import { useOrderBook, loadHistory, saveHistory } from './hooks/useOrderBook'
import type { HistoryEntry } from './hooks/useOrderBook'
import { useOrderBookFetch } from './hooks/useOrderBookFetch'
import type { DataSource } from './hooks/useOrderBookFetch'
import { PriceInput } from './components/PriceInput'
import { SymbolSelector } from './components/SymbolSelector'
import { Calculator } from './components/Calculator'
import type { CalcResult, CalcNotification, OrderBookPrices } from './components/Calculator'
import type { OverlayLine } from './components/CandlestickChart'
import { BottomNav } from './components/BottomNav'
import type { TabId } from './components/BottomNav'
import { IconRefresh, IconShare, IconBell, IconStar, IconStarFilled, IconSignal } from './components/Icons'

const ChartScreen = lazy(() => import('./components/ChartScreen').then(m => ({ default: m.ChartScreen })))

const REFRESH_INTERVALS = [30, 60] as const

interface OrderHistoryEntry {
  id: string
  symbol: string
  position: 'LONG' | 'SHORT'
  entryPrice: number
  tpPrice: number
  slPrice: number
  numCoins: number
  leverage: number
  openTime: string
  closeTime: string
  closePrice: number
  pnlUsd: number
  pnlPct: number
  result: 'tp' | 'sl' | 'manual'
}

function App() {
  const {
    shortPrices,
    longPrices,
    computed,
    prevPrices,
    updateShortPrice,
    updateLongPrice,
    addShortPrice,
    addLongPrice,
    removeShortPrice,
    removeLongPrice,
    loadPrices,
  } = useOrderBook()

  const [symbol, setSymbol] = useState('BTCUSDT')
  const [dataSource, setDataSource] = useState<DataSource>(() => {
    return (localStorage.getItem('ob_dataSource') as DataSource) || 'spot'
  })
  const { fetchOrderBook, loading, error } = useOrderBookFetch(symbol, dataSource)

  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState<number>(() => {
    const saved = localStorage.getItem('ob_refreshInterval')
    return saved ? Number(saved) : 30
  })
  const [countdown, setCountdown] = useState(0)
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory())
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('orderbook')

  // Alert state
  const [alertPrice, setAlertPrice] = useState<number | null>(null)
  const [alertDirection, setAlertDirection] = useState<'above' | 'below'>('above')
  const [alertDraft, setAlertDraft] = useState('')
  const [alertSound, setAlertSound] = useState(() => {
    return localStorage.getItem('ob_alertSound') !== 'false'
  })

  // Favorites state
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ob_favorites')
      return saved ? JSON.parse(saved) : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']
    } catch {
      return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']
    }
  })

  // Dominance state
  const [dominance, setDominance] = useState<{ buyPct: number; sellPct: number } | null>(null)

  // Calculator state for chart overlay
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Funding rate
  const [fundingRate, setFundingRate] = useState<number | null>(null)

  useEffect(() => {
    const fetchFunding = async () => {
      try {
        const res = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`)
        if (res.ok) {
          const data = await res.json()
          setFundingRate(parseFloat(data.lastFundingRate))
        }
      } catch {
        // Funding rate not available (e.g. error 451 for some regions)
      }
    }
    fetchFunding()
    const timer = setInterval(fetchFunding, 60000)
    return () => clearInterval(timer)
  }, [symbol])

  // Calc order notifications and execution state
  const [calcNotifications, setCalcNotifications] = useState<CalcNotification[]>([])
  const [orderActive, setOrderActive] = useState(false)
  const [orderStartPrice, setOrderStartPrice] = useState<number | null>(null)

  // Order history
  const [orderHistory, setOrderHistory] = useState<OrderHistoryEntry[]>(() => {
    try {
      const saved = localStorage.getItem('ob_orderHistory')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem('ob_orderHistory', JSON.stringify(orderHistory))
  }, [orderHistory])

  const handleOrderActive = useCallback((active: boolean) => {
    if (active) {
      setOrderActive(true)
      setOrderStartPrice(currentPrice)
    } else {
      // Save order to history when closing
      if (calcResult && calcResult.entryPrice > 0) {
        const closeP = currentPrice ?? calcResult.entryPrice
        const isLong = calcResult.position === 'LONG'
        const pnlPct = isLong
          ? ((closeP - calcResult.entryPrice) / calcResult.entryPrice) * 100
          : ((calcResult.entryPrice - closeP) / calcResult.entryPrice) * 100
        const pnlUsd = calcResult.numCoins * Math.abs(closeP - calcResult.entryPrice) * (pnlPct >= 0 ? 1 : -1)

        let result: 'tp' | 'sl' | 'manual' = 'manual'
        const tpDist = Math.abs(closeP - calcResult.tpNoRecompra)
        const slDist = Math.abs(closeP - calcResult.lastSl)
        const threshold = calcResult.entryPrice * 0.002
        if (tpDist < threshold) result = 'tp'
        else if (slDist < threshold) result = 'sl'

        const entry: OrderHistoryEntry = {
          id: Date.now().toString(),
          symbol,
          position: calcResult.position,
          entryPrice: calcResult.entryPrice,
          tpPrice: calcResult.tpNoRecompra,
          slPrice: calcResult.lastSl,
          numCoins: calcResult.numCoins,
          leverage: calcResult.leverage,
          openTime: orderStartPrice ? new Date().toISOString() : new Date().toISOString(),
          closeTime: new Date().toISOString(),
          closePrice: closeP,
          pnlUsd,
          pnlPct,
          result,
        }
        setOrderHistory(prev => [entry, ...prev].slice(0, 50))
      }
      setOrderActive(false)
      setOrderStartPrice(null)
    }
  }, [calcResult, currentPrice, symbol, orderStartPrice])

  // Save data source preference
  useEffect(() => {
    localStorage.setItem('ob_dataSource', dataSource)
  }, [dataSource])

  // Save alert sound preference
  useEffect(() => {
    localStorage.setItem('ob_alertSound', alertSound ? 'true' : 'false')
  }, [alertSound])

  // Save favorites
  useEffect(() => {
    localStorage.setItem('ob_favorites', JSON.stringify(favorites))
  }, [favorites])

  const toggleFavorite = useCallback((sym: string) => {
    setFavorites(prev => {
      if (prev.includes(sym)) {
        return prev.filter(s => s !== sym)
      }
      return [...prev, sym]
    })
  }, [])

  const playAlertSound = useCallback(() => {
    if (!alertSound) return
    try {
      const audioCtx = new AudioContext()
      const oscillator = audioCtx.createOscillator()
      const gainNode = audioCtx.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(audioCtx.destination)
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime)
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime)
      oscillator.start()
      oscillator.frequency.setValueAtTime(1100, audioCtx.currentTime + 0.1)
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime + 0.2)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5)
      oscillator.stop(audioCtx.currentTime + 0.5)
    } catch {
      // Audio not available
    }
  }, [alertSound])

  // Monitor price vs calculator levels
  const calcNotifiedRef = useRef<Set<string>>(new Set())
  const prevCalcKeyRef = useRef<string>('')
  const calcResultRef = useRef<CalcResult | null>(null)
  useEffect(() => {
    calcResultRef.current = calcResult
  }, [calcResult])

  const checkCalcLevels = useCallback((price: number) => {
    const cr = calcResultRef.current
    if (!cr || cr.entryPrice <= 0) return

    const calcKey = `${cr.entryPrice}_${cr.position}`
    if (calcKey !== prevCalcKeyRef.current) {
      calcNotifiedRef.current = new Set()
      prevCalcKeyRef.current = calcKey
    }

    const threshold = price * 0.001
    const levels: { id: string; price: number; label: string; type: 'entry' | 'tp' | 'sl' | 'recompra' | 'liq' }[] = [
      { id: 'calc_entry', price: cr.entryPrice, label: 'Entrada', type: 'entry' },
      { id: 'calc_tp', price: cr.tpNoRecompra, label: 'Take Profit', type: 'tp' },
      { id: 'calc_sl', price: cr.lastSl, label: 'Stop Loss', type: 'sl' },
      { id: 'calc_liq', price: cr.liqPrice, label: 'Liquidación', type: 'liq' },
    ]
    cr.rows.forEach((row, idx) => {
      if (row.recompraPrice > 0) {
        levels.push({ id: `calc_rec_${idx}`, price: row.recompraPrice, label: `Recompra ${idx + 1}`, type: 'recompra' })
      }
    })

    const newNotifs: CalcNotification[] = []
    for (const level of levels) {
      if (level.price <= 0 || calcNotifiedRef.current.has(level.id)) continue
      if (Math.abs(price - level.price) <= threshold) {
        playAlertSound()
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200, 100, 200])
        calcNotifiedRef.current.add(level.id)
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        newNotifs.push({ id: level.id, msg: `${level.label}: $${level.price.toFixed(2)} (${cr.position})`, time, type: level.type })
      }
    }
    if (newNotifs.length > 0) {
      setCalcNotifications(prev => [...newNotifs, ...prev].slice(0, 20))
    }
  }, [playAlertSound])

  const handleFetch = useCallback(async () => {
    const result = await fetchOrderBook()
    if (result) {
      loadPrices(result.shortPrices, result.longPrices)
      setCurrentPrice(result.currentPrice)
      setLastUpdate(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      )

      // Calculate dominance from volumes
      const totalBuyVol = result.longPrices.reduce((a, b) => a + b.volume, 0)
      const totalSellVol = result.shortPrices.reduce((a, b) => a + b.volume, 0)
      const total = totalBuyVol + totalSellVol
      if (total > 0) {
        setDominance({
          buyPct: Math.round((totalBuyVol / total) * 100),
          sellPct: Math.round((totalSellVol / total) * 100),
        })
      }

      const shortAvg =
        result.shortPrices.reduce((a, b) => a + b.price, 0) /
        result.shortPrices.length
      const longAvg =
        result.longPrices.reduce((a, b) => a + b.price, 0) /
        result.longPrices.length
      const f3 = (shortAvg + longAvg) / 2
      const si = Math.min(7, result.shortPrices.length - 1)
      const li = Math.min(7, result.longPrices.length - 1)
      const ep =
        (f3 + result.shortPrices[si].price + result.longPrices[li].price) / 3

      const entry: HistoryEntry = {
        timestamp: Date.now(),
        symbol,
        entryPoint: ep,
        avgShort: shortAvg,
        avgLong: longAvg,
        currentPrice: result.currentPrice,
      }
      setHistory((prev) => {
        const next = [...prev, entry]
        saveHistory(next)
        return next
      })

      // Check calc order levels
      checkCalcLevels(result.currentPrice)

      if (alertPrice !== null) {
        const triggered =
          alertDirection === 'above'
            ? result.currentPrice >= alertPrice
            : result.currentPrice <= alertPrice
        if (triggered) {
          if ('vibrate' in navigator) navigator.vibrate([200, 100, 200])
          playAlertSound()
          alert(
            `${symbol.replace('USDT', '')} llegó a $${result.currentPrice.toLocaleString()} (alerta: ${alertDirection === 'above' ? '≥' : '≤'} $${alertPrice.toLocaleString()})`,
          )
          setAlertPrice(null)
        }
      }
    }
  }, [fetchOrderBook, loadPrices, symbol, alertPrice, alertDirection, playAlertSound, checkCalcLevels])

  const fetchRef = useRef(handleFetch)
  useEffect(() => {
    fetchRef.current = handleFetch
  }, [handleFetch])

  useEffect(() => {
    localStorage.setItem('ob_refreshInterval', String(refreshInterval))
  }, [refreshInterval])

  useEffect(() => {
    if (!autoRefresh) return
    const ms = refreshInterval * 1000
    const initTimer = setTimeout(() => fetchRef.current(), 0)
    const startTime = Date.now()
    intervalRef.current = setInterval(() => fetchRef.current(), ms)
    countdownRef.current = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000) % refreshInterval
      setCountdown(Math.max(0, Math.round(refreshInterval - elapsed)))
    }, 1000)
    return () => {
      clearTimeout(initTimer)
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [autoRefresh, refreshInterval])

  const handleExport = useCallback(() => {
    const base = symbol.replace('USDT', '')
    const lines = [
      `LIBRO DE ORDENES - ${base}/USDT (${dataSource === 'futures' ? 'Futures' : 'Spot'})`,
      `Fecha: ${new Date().toLocaleString()}`,
      currentPrice ? `Precio Actual: $${currentPrice.toLocaleString()}` : '',
      `Punto de Entrada: ${computed.entryPoint2.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      '',
      `Bloque Tope Short: ${computed.bloqueTopeShort.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      `Bloque de Short: ${computed.bloqueDeShort.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      `Bloque de Long: ${computed.bloqueDeLong.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      `Bloque Tope Long: ${computed.bloqueTopeLong.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      '',
      'SHORT:',
      ...shortPrices.map((p, i) => `  ${i + 1}. ${p.price.toLocaleString()}`),
      '',
      'LONG:',
      ...longPrices.map((p, i) => `  ${i + 1}. ${p.price.toLocaleString()}`),
    ]
    const text = lines.filter((l) => l !== undefined).join('\n')
    if (navigator.share) {
      navigator.share({ title: `Order Book ${base}/USDT`, text }).catch(() => {})
    } else {
      navigator.clipboard.writeText(text).then(() => alert('Datos copiados al portapapeles'))
    }
  }, [symbol, dataSource, currentPrice, computed, shortPrices, longPrices])

  const base = symbol.replace('USDT', '')

  const fmt = (v: number) =>
    v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const sourceLabel = dataSource === 'futures' ? 'Futures' : 'Spot'

  // Buy/sell signal based on current price vs order book levels
  const signal = useMemo<{ type: 'buy' | 'sell' | 'neutral'; label: string; color: string }>(() => {
    if (currentPrice === null || computed.entryPoint2 === 0) {
      return { type: 'neutral', label: 'SIN DATOS', color: '#6b7280' }
    }
    const entry = computed.entryPoint2
    const bLong = computed.bloqueDeLong
    const tLong = computed.bloqueTopeLong
    const bShort = computed.bloqueDeShort
    const tShort = computed.bloqueTopeShort

    if (currentPrice <= tLong) {
      return { type: 'buy', label: 'ZONA DE COMPRA', color: '#22c55e' }
    }
    if (currentPrice <= bLong) {
      return { type: 'buy', label: 'SEÑAL DE COMPRA', color: '#4ade80' }
    }
    if (currentPrice >= tShort) {
      return { type: 'sell', label: 'ZONA DE VENTA', color: '#ef4444' }
    }
    if (currentPrice >= bShort) {
      return { type: 'sell', label: 'SEÑAL DE VENTA', color: '#f87171' }
    }
    if (currentPrice < entry) {
      return { type: 'buy', label: 'TENDENCIA COMPRA', color: '#86efac' }
    }
    if (currentPrice > entry) {
      return { type: 'sell', label: 'TENDENCIA VENTA', color: '#fca5a5' }
    }
    return { type: 'neutral', label: 'NEUTRAL', color: '#9ca3af' }
  }, [currentPrice, computed])

  // Build overlay lines for the chart (5 order book levels)
  const chartOverlayLines = useMemo<OverlayLine[]>(() => {
    const lines: OverlayLine[] = []
    if (computed.bloqueTopeShort > 0) {
      lines.push({ price: computed.bloqueTopeShort, color: '#ef4444', label: 'T.SHORT' })
    }
    if (computed.bloqueDeShort > 0) {
      lines.push({ price: computed.bloqueDeShort, color: '#f87171', label: 'B.SHORT' })
    }
    if (computed.entryPoint2 > 0) {
      lines.push({ price: computed.entryPoint2, color: '#fbbf24', label: 'ENTRADA' })
    }
    if (computed.bloqueDeLong > 0) {
      lines.push({ price: computed.bloqueDeLong, color: '#4ade80', label: 'B.LONG' })
    }
    if (computed.bloqueTopeLong > 0) {
      lines.push({ price: computed.bloqueTopeLong, color: '#22c55e', label: 'T.LONG' })
    }
    return lines
  }, [computed.bloqueTopeShort, computed.bloqueDeShort, computed.entryPoint2, computed.bloqueDeLong, computed.bloqueTopeLong])

  // ─── Tab: Order Book ─────────────────────────────
  const renderOrderBook = () => (
    <div className="flex-1 overflow-y-auto">
      {/* Favorites Quick Switch */}
      {favorites.length > 0 && (
        <div className="px-4 pt-3 pb-1">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {favorites.map((fav) => {
              const favBase = fav.replace('USDT', '')
              const isActive = fav === symbol
              return (
                <button
                  key={fav}
                  onClick={() => setSymbol(fav)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors shrink-0"
                  style={{
                    backgroundColor: isActive
                      ? 'rgba(251,191,36,0.2)'
                      : 'rgba(255,255,255,0.05)',
                    color: isActive ? '#fbbf24' : '#9ca3af',
                    border: isActive ? '1px solid rgba(251,191,36,0.3)' : '1px solid transparent',
                  }}
                >
                  {favBase}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Symbol + Price Card */}
      <div className="px-4 pt-2 pb-2">
        <div className="rounded-2xl p-4" style={{ backgroundColor: '#1e2536' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  autoRefresh
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'text-gray-400 border'
                }`}
                style={!autoRefresh ? { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(75,85,99,0.3)' } : undefined}
              >
                <IconRefresh size={14} className={loading ? 'animate-spin' : ''} />
                {autoRefresh ? `${countdown}s` : 'Auto'}
              </button>
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#6b7280' }}>
                {sourceLabel}
              </span>
              <button
                onClick={() => toggleFavorite(symbol)}
                className="p-1"
              >
                {favorites.includes(symbol) ? (
                  <IconStarFilled size={16} className="text-yellow-400" />
                ) : (
                  <IconStar size={16} style={{ color: '#6b7280' }} />
                )}
              </button>
            </div>
            <SymbolSelector symbol={symbol} onSymbolChange={setSymbol} />
          </div>

          {/* Current Price */}
          {currentPrice !== null ? (
            <div className="mb-1">
              <span className="text-3xl font-bold tabular-nums tracking-tight text-white">
                ${currentPrice.toLocaleString()}
              </span>
              {lastUpdate && (
                <span className="text-xs ml-2" style={{ color: '#6b7280' }}>{lastUpdate}</span>
              )}
            </div>
          ) : (
            <div className="text-sm mb-1" style={{ color: '#6b7280' }}>Ve a Ajustes para obtener datos</div>
          )}
          {error && (
            <div className="text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-1.5 mt-2">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Buy/Sell Signal */}
      {currentPrice !== null && (
        <div className="px-4 pb-2">
          <div className="rounded-2xl p-3 flex items-center gap-3" style={{ backgroundColor: `${signal.color}15`, border: `1px solid ${signal.color}30` }}>
            <IconSignal size={20} style={{ color: signal.color }} />
            <div className="flex-1">
              <div className="text-xs font-bold tracking-wider" style={{ color: signal.color }}>
                {signal.label}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: '#6b7280' }}>
                {signal.type === 'buy' ? 'Precio cerca de zona de compra' : signal.type === 'sell' ? 'Precio cerca de zona de venta' : 'Esperando datos'}
              </div>
            </div>
            <div className="text-right space-y-0.5">
              {dominance && (
                <div>
                  <div className="text-[10px]" style={{ color: '#6b7280' }}>Dominancia</div>
                  <div className="flex items-center gap-1 text-[10px] font-bold">
                    <span className="text-green-400">{dominance.buyPct}%</span>
                    <span style={{ color: '#6b7280' }}>|</span>
                    <span className="text-red-400">{dominance.sellPct}%</span>
                  </div>
                </div>
              )}
              {fundingRate !== null && (
                <div>
                  <div className="text-[10px]" style={{ color: '#6b7280' }}>Funding Rate</div>
                  <div className="text-[10px] font-bold" style={{ color: fundingRate >= 0 ? '#22c55e' : '#ef4444' }}>
                    {fundingRate >= 0 ? '+' : ''}{(fundingRate * 100).toFixed(4)}%
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dominance Bar */}
      {dominance && (
        <div className="px-4 pb-2">
          <div className="rounded-xl overflow-hidden h-1.5 flex" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
            <div className="bg-green-500 transition-all duration-500" style={{ width: `${dominance.buyPct}%` }} />
            <div className="bg-red-500 transition-all duration-500" style={{ width: `${dominance.sellPct}%` }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-green-400 font-medium">Compradores {dominance.buyPct}%</span>
            <span className="text-[9px] text-red-400 font-medium">Vendedores {dominance.sellPct}%</span>
          </div>
        </div>
      )}

      {/* Entry Point Card */}
      <div className="px-4 pb-2">
        <div className="bg-gradient-to-r from-yellow-500/20 to-amber-500/10 border border-yellow-500/20 rounded-2xl p-4">
          <div className="text-xs font-medium text-yellow-400/70 uppercase tracking-wider mb-1">
            Punto de Entrada
          </div>
          <div className="text-2xl font-bold tabular-nums text-yellow-400">
            {fmt(computed.entryPoint2)}
          </div>
        </div>
      </div>

      {/* Blocks Grid */}
      <div className="grid grid-cols-2 gap-2 px-4 pb-2">
        <div className="rounded-xl p-3" style={{ backgroundColor: '#1e2536' }}>
          <div className="text-[10px] font-medium text-red-400/60 uppercase tracking-wider mb-1">
            Bloque Tope Short
          </div>
          <div className="text-sm font-bold text-red-400 tabular-nums">{fmt(computed.bloqueTopeShort)}</div>
        </div>
        <div className="rounded-xl p-3" style={{ backgroundColor: '#1e2536' }}>
          <div className="text-[10px] font-medium text-red-400/60 uppercase tracking-wider mb-1">
            Bloque de Short
          </div>
          <div className="text-sm font-bold text-red-400 tabular-nums">{fmt(computed.bloqueDeShort)}</div>
        </div>
        <div className="rounded-xl p-3" style={{ backgroundColor: '#1e2536' }}>
          <div className="text-[10px] font-medium text-green-400/60 uppercase tracking-wider mb-1">
            Bloque de Long
          </div>
          <div className="text-sm font-bold text-green-400 tabular-nums">{fmt(computed.bloqueDeLong)}</div>
        </div>
        <div className="rounded-xl p-3" style={{ backgroundColor: '#1e2536' }}>
          <div className="text-[10px] font-medium text-green-400/60 uppercase tracking-wider mb-1">
            Bloque Tope Long
          </div>
          <div className="text-sm font-bold text-green-400 tabular-nums">{fmt(computed.bloqueTopeLong)}</div>
        </div>
      </div>

      {/* Price Columns */}
      <div className="px-4 pb-4">
        <div className="grid grid-cols-2 gap-3">
          {/* SHORT Column */}
          <div>
            <div className="bg-red-500/20 border border-red-500/20 text-red-400 text-center font-bold text-xs py-2 rounded-t-xl uppercase tracking-wider">
              Short
            </div>
            <div className="rounded-b-xl p-2 space-y-1" style={{ backgroundColor: '#1e2536' }}>
              {shortPrices.map((pl, i) => (
                <div key={i} className="group">
                  <PriceInput
                    value={pl.price}
                    volume={pl.volume}
                    prevPrice={prevPrices.short[i]}
                    onChange={(v) => updateShortPrice(i, v)}
                    onRemove={() => removeShortPrice(i)}
                    variant="short"
                    index={i}
                  />
                </div>
              ))}
              <button
                onClick={addShortPrice}
                className="w-full text-center text-xs text-red-400/60 border border-dashed border-red-500/20 rounded-lg py-1.5 hover:bg-red-900/20 transition-colors"
              >
                + Agregar
              </button>
            </div>
          </div>

          {/* LONG Column */}
          <div>
            <div className="bg-green-500/20 border border-green-500/20 text-green-400 text-center font-bold text-xs py-2 rounded-t-xl uppercase tracking-wider">
              Long
            </div>
            <div className="rounded-b-xl p-2 space-y-1" style={{ backgroundColor: '#1e2536' }}>
              {longPrices.map((pl, i) => (
                <div key={i} className="group">
                  <PriceInput
                    value={pl.price}
                    volume={pl.volume}
                    prevPrice={prevPrices.long[i]}
                    onChange={(v) => updateLongPrice(i, v)}
                    onRemove={() => removeLongPrice(i)}
                    variant="long"
                    index={i}
                  />
                </div>
              ))}
              <button
                onClick={addLongPrice}
                className="w-full text-center text-xs text-green-400/60 border border-dashed border-green-500/20 rounded-lg py-1.5 hover:bg-green-900/20 transition-colors"
              >
                + Agregar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Averages footer */}
      <div className="px-4 pb-4">
        <div className="rounded-xl px-4 py-2.5 flex justify-between text-xs" style={{ backgroundColor: '#1e2536' }}>
          <div>
            <span style={{ color: '#6b7280' }}>Prom. Short: </span>
            <span className="font-bold text-red-400 tabular-nums">{fmt(computed.avgShort)}</span>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>Prom. Long: </span>
            <span className="font-bold text-green-400 tabular-nums">{fmt(computed.avgLong)}</span>
          </div>
        </div>
      </div>
    </div>
  )

  // ─── Tab: Chart ──────────────────────────────────
  const renderChart = () => (
    <div className="flex-1 flex flex-col">
      <Suspense fallback={<div className="flex-1 flex items-center justify-center" style={{ background: '#141821' }}><span className="text-gray-500">Cargando gráfico...</span></div>}>
        <ChartScreen symbol={symbol} onClose={() => setActiveTab('orderbook')} embedded overlayLines={chartOverlayLines} dataSourceLabel={sourceLabel} activeOrder={orderActive && calcResult ? { calc: calcResult, currentPrice: currentPrice ?? 0 } : null} fundingRate={fundingRate} />
      </Suspense>
    </div>
  )

  // ─── Tab: History ────────────────────────────────
  const [historyTab, setHistoryTab] = useState<'orders' | 'data'>('orders')

  const renderHistory = () => {
    const wins = orderHistory.filter(o => o.pnlUsd > 0).length
    const losses = orderHistory.filter(o => o.pnlUsd <= 0).length
    const totalPnl = orderHistory.reduce((sum, o) => sum + o.pnlUsd, 0)
    const winRate = orderHistory.length > 0 ? (wins / orderHistory.length * 100) : 0

    return (
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        <h2 className="text-lg font-bold mb-3" style={{ color: '#ffffff' }}>Historial</h2>

        {/* Sub-tabs */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setHistoryTab('orders')}
            className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors"
            style={{
              backgroundColor: historyTab === 'orders' ? 'rgba(251,191,36,0.2)' : '#1e2536',
              color: historyTab === 'orders' ? '#fbbf24' : '#6b7280',
              border: historyTab === 'orders' ? '1px solid rgba(251,191,36,0.3)' : '1px solid transparent',
            }}
          >
            Órdenes
          </button>
          <button
            onClick={() => setHistoryTab('data')}
            className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors"
            style={{
              backgroundColor: historyTab === 'data' ? 'rgba(251,191,36,0.2)' : '#1e2536',
              color: historyTab === 'data' ? '#fbbf24' : '#6b7280',
              border: historyTab === 'data' ? '1px solid rgba(251,191,36,0.3)' : '1px solid transparent',
            }}
          >
            Datos
          </button>
        </div>

        {historyTab === 'orders' ? (
          <>
            {/* Stats summary */}
            {orderHistory.length > 0 && (
              <div className="rounded-xl p-3 mb-3 grid grid-cols-4 gap-2" style={{ backgroundColor: '#1e2536' }}>
                <div className="text-center">
                  <p className="text-[9px]" style={{ color: '#6b7280' }}>Total</p>
                  <p className="text-sm font-bold text-white">{orderHistory.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-[9px]" style={{ color: '#6b7280' }}>Win Rate</p>
                  <p className="text-sm font-bold" style={{ color: winRate >= 50 ? '#22c55e' : '#ef4444' }}>{winRate.toFixed(0)}%</p>
                </div>
                <div className="text-center">
                  <p className="text-[9px]" style={{ color: '#6b7280' }}>W/L</p>
                  <p className="text-sm font-bold">
                    <span style={{ color: '#22c55e' }}>{wins}</span>
                    <span style={{ color: '#6b7280' }}>/</span>
                    <span style={{ color: '#ef4444' }}>{losses}</span>
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[9px]" style={{ color: '#6b7280' }}>P&L</p>
                  <p className="text-sm font-bold" style={{ color: totalPnl >= 0 ? '#22c55e' : '#ef4444' }}>
                    {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
                  </p>
                </div>
              </div>
            )}

            {orderHistory.length > 0 && (
              <button
                onClick={() => { if (confirm('¿Eliminar todo el historial de órdenes?')) setOrderHistory([]) }}
                className="w-full mb-2 py-1.5 rounded-lg text-[10px] font-bold text-red-400"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}
              >
                Eliminar todo
              </button>
            )}

            {orderHistory.length === 0 ? (
              <div className="text-center py-12 text-sm" style={{ color: '#6b7280' }}>
                Aún no hay órdenes. Ejecuta una orden desde la calculadora.
              </div>
            ) : (
              <div className="space-y-2">
                {orderHistory.map(o => {
                  const d = new Date(o.closeTime)
                  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  const date = d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
                  const isWin = o.pnlUsd > 0
                  const resultLabel = o.result === 'tp' ? 'TP' : o.result === 'sl' ? 'SL' : 'Manual'
                  const resultColor = o.result === 'tp' ? '#22c55e' : o.result === 'sl' ? '#ef4444' : '#fbbf24'

                  return (
                    <div key={o.id} className="rounded-xl p-3" style={{ backgroundColor: '#1e2536' }}>
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: o.position === 'LONG' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
                              color: o.position === 'LONG' ? '#22c55e' : '#ef4444',
                            }}>
                            {o.position}
                          </span>
                          <span className="text-xs font-bold text-white">{o.symbol.replace('USDT', '')}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                            style={{ backgroundColor: `${resultColor}20`, color: resultColor }}>
                            {resultLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px]" style={{ color: '#6b7280' }}>{date} {time}</span>
                          <button
                            onClick={() => setOrderHistory(prev => prev.filter(x => x.id !== o.id))}
                            className="text-gray-600 hover:text-red-400 text-xs px-1"
                          >✕</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 text-[10px] mb-2">
                        <div>
                          <span style={{ color: '#6b7280' }}>Entrada</span>
                          <p className="font-bold text-white">${o.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <span style={{ color: '#6b7280' }}>Cierre</span>
                          <p className="font-bold text-white">${o.closePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <span style={{ color: '#6b7280' }}>{o.leverage}x · {o.numCoins} mon</span>
                          <p className="font-bold" style={{ color: isWin ? '#22c55e' : '#ef4444' }}>
                            {isWin ? '+' : ''}{o.pnlUsd.toFixed(2)} ({isWin ? '+' : ''}{o.pnlPct.toFixed(2)}%)
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 text-[9px]">
                        <span style={{ color: '#22c55e' }}>TP: ${o.tpPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                        <span style={{ color: '#ef4444' }}>SL: ${o.slPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <>
            {history.length > 0 && (
              <button
                onClick={() => { if (confirm('¿Eliminar todo el historial de datos?')) { setHistory([]); saveHistory([]) } }}
                className="w-full mb-2 py-1.5 rounded-lg text-[10px] font-bold text-red-400"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}
              >
                Eliminar todo
              </button>
            )}
            {(() => {
              const reversed = [...history].reverse()
              return reversed.length === 0 ? (
                <div className="text-center py-12 text-sm" style={{ color: '#6b7280' }}>
                  Aún no hay historial. Obtén datos para empezar.
                </div>
              ) : (
                <div className="space-y-2">
                  {reversed.map((e, i) => {
                    const d = new Date(e.timestamp)
                    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    const date = d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
                    return (
                      <div key={i} className="rounded-xl p-3" style={{ backgroundColor: '#1e2536' }}>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs bg-yellow-500/20 text-yellow-400 font-bold px-2 py-0.5 rounded-full">
                            {e.symbol.replace('USDT', '')}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs" style={{ color: '#6b7280' }}>{date} {time}</span>
                            <button
                              onClick={() => {
                                const idx = history.length - 1 - i
                                setHistory(prev => { const n = [...prev]; n.splice(idx, 1); saveHistory(n); return n })
                              }}
                              className="text-gray-600 hover:text-red-400 text-xs px-1"
                            >✕</button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span style={{ color: '#6b7280' }}>Precio: </span>
                            <span className="font-bold" style={{ color: '#ffffff' }}>{e.currentPrice.toLocaleString()}</span>
                          </div>
                          <div>
                            <span style={{ color: '#6b7280' }}>Entrada: </span>
                            <span className="text-yellow-400 font-bold">
                              {e.entryPoint.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#6b7280' }}>Short: </span>
                            <span className="text-red-400 font-bold">
                              {e.avgShort.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#6b7280' }}>Long: </span>
                            <span className="text-green-400 font-bold">
                              {e.avgLong.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </>
        )}
      </div>
    )
  }

  // ─── Tab: Settings (Alerts + Config) ─────────────
  const renderSettings = () => (
    <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-4">
      <h2 className="text-lg font-bold" style={{ color: '#ffffff' }}>Ajustes</h2>

      {/* Fetch Data section */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: '#1e2536' }}>
        <div className="flex items-center gap-2 mb-3">
          <IconRefresh size={18} className="text-yellow-400" />
          <h3 className="text-sm font-bold" style={{ color: '#ffffff' }}>Obtener Datos</h3>
        </div>

        {/* Data source selector */}
        <div className="mb-3">
          <div className="text-xs mb-2" style={{ color: '#9ca3af' }}>Fuente de datos:</div>
          <div className="flex gap-2">
            <button
              onClick={() => setDataSource('spot')}
              className={`flex-1 text-xs font-bold py-2 rounded-xl transition-colors ${
                dataSource === 'spot'
                  ? 'bg-yellow-500 text-black'
                  : ''
              }`}
              style={dataSource !== 'spot' ? { backgroundColor: 'rgba(255,255,255,0.05)', color: '#9ca3af', border: '1px solid #374151' } : undefined}
            >
              Spot
            </button>
            <button
              onClick={() => setDataSource('futures')}
              className={`flex-1 text-xs font-bold py-2 rounded-xl transition-colors ${
                dataSource === 'futures'
                  ? 'bg-yellow-500 text-black'
                  : ''
              }`}
              style={dataSource !== 'futures' ? { backgroundColor: 'rgba(255,255,255,0.05)', color: '#9ca3af', border: '1px solid #374151' } : undefined}
            >
              Futures
            </button>
          </div>
        </div>

        <button
          onClick={handleFetch}
          disabled={loading}
          className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:bg-yellow-500/50 text-black font-bold text-sm py-2.5 rounded-xl transition-colors active:scale-[0.98]"
        >
          {loading ? 'Cargando...' : `Obtener Datos (${base} - ${sourceLabel})`}
        </button>
        {error && (
          <div className="text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-1.5 mt-2">
            {error}
          </div>
        )}
        {dataSource === 'futures' && (
          <div className="text-[10px] mt-2" style={{ color: '#6b7280' }}>
            Futures puede dar error 451 si está bloqueado en tu región.
          </div>
        )}
      </div>

      {/* Alert section */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: '#1e2536' }}>
        <div className="flex items-center gap-2 mb-3">
          <IconBell size={18} className="text-yellow-400" />
          <h3 className="text-sm font-bold" style={{ color: '#ffffff' }}>Alerta de Precio</h3>
        </div>

        {alertPrice !== null && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2 mb-3 flex items-center justify-between">
            <span className="text-xs text-orange-400">
              Activa: {alertDirection === 'above' ? '≥' : '≤'} ${alertPrice.toLocaleString()}
            </span>
            <button
              onClick={() => setAlertPrice(null)}
              className="text-xs text-orange-400 bg-orange-500/20 px-2 py-0.5 rounded-full"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* Sound toggle */}
        <div className="flex items-center justify-between mb-3 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span className="text-xs" style={{ color: '#9ca3af' }}>Sonido de alerta</span>
          <button
            onClick={() => setAlertSound(!alertSound)}
            className="relative w-11 h-6 rounded-full transition-colors"
            style={{ backgroundColor: alertSound ? '#22c55e' : '#374151' }}
          >
            <div
              className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
              style={{ transform: alertSound ? 'translateX(22px)' : 'translateX(2px)' }}
            />
          </button>
        </div>

        <div className="space-y-2">
          <div className="text-xs" style={{ color: '#9ca3af' }}>Notificar cuando {base} llegue a:</div>
          <div className="flex gap-2">
            <select
              value={alertDirection}
              onChange={(e) => setAlertDirection(e.target.value as 'above' | 'below')}
              className="text-xs rounded-lg px-3 py-2 outline-none"
              style={{ backgroundColor: '#1f2937', color: '#ffffff', border: '1px solid #374151' }}
            >
              <option value="above">≥ Sube a</option>
              <option value="below">≤ Baja a</option>
            </select>
            <input
              type="number"
              value={alertDraft}
              onChange={(e) => setAlertDraft(e.target.value)}
              placeholder="Precio"
              className="flex-1 text-xs rounded-lg px-3 py-2 outline-none"
              style={{ backgroundColor: '#1f2937', color: '#ffffff', border: '1px solid #374151' }}
            />
          </div>
          <button
            onClick={() => {
              const p = parseFloat(alertDraft)
              if (!isNaN(p)) setAlertPrice(p)
            }}
            className="w-full bg-yellow-500 text-black text-sm font-bold py-2 rounded-xl active:scale-[0.98] transition-transform"
          >
            Activar Alerta
          </button>
        </div>
      </div>

      {/* Auto-refresh section */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: '#1e2536' }}>
        <div className="flex items-center gap-2 mb-3">
          <IconRefresh size={18} className="text-yellow-400" />
          <h3 className="text-sm font-bold" style={{ color: '#ffffff' }}>Auto-Refresh</h3>
        </div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs" style={{ color: '#9ca3af' }}>Activar auto-refresh</span>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="relative w-11 h-6 rounded-full transition-colors"
            style={{ backgroundColor: autoRefresh ? '#22c55e' : '#374151' }}
          >
            <div
              className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
              style={{ transform: autoRefresh ? 'translateX(22px)' : 'translateX(2px)' }}
            />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: '#9ca3af' }}>Intervalo:</span>
          <div className="flex gap-2">
            {REFRESH_INTERVALS.map(s => (
              <button
                key={s}
                onClick={() => setRefreshInterval(s)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                style={{
                  backgroundColor: refreshInterval === s ? '#22c55e20' : 'rgba(255,255,255,0.05)',
                  color: refreshInterval === s ? '#22c55e' : '#9ca3af',
                  border: refreshInterval === s ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(75,85,99,0.3)',
                }}
              >
                {s}s
              </button>
            ))}
          </div>
        </div>
        {autoRefresh && (
          <div className="text-xs text-green-400 mt-2">
            Próxima actualización en {countdown}s
          </div>
        )}
      </div>

      {/* Favorites management */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: '#1e2536' }}>
        <div className="flex items-center gap-2 mb-3">
          <IconStarFilled size={18} className="text-yellow-400" />
          <h3 className="text-sm font-bold" style={{ color: '#ffffff' }}>Pares Favoritos</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {favorites.map((fav) => (
            <div
              key={fav}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}
            >
              <span className="text-yellow-400">{fav.replace('USDT', '')}</span>
              <button
                onClick={() => toggleFavorite(fav)}
                className="text-yellow-400/60 hover:text-red-400 ml-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="text-[10px] mt-2" style={{ color: '#6b7280' }}>
          Toca la estrella ★ en la pantalla principal para agregar/quitar favoritos.
        </div>
      </div>

      {/* Export section */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: '#1e2536' }}>
        <div className="flex items-center gap-2 mb-3">
          <IconShare size={18} className="text-yellow-400" />
          <h3 className="text-sm font-bold" style={{ color: '#ffffff' }}>Exportar Datos</h3>
        </div>
        <button
          onClick={handleExport}
          className="w-full text-sm font-medium py-2.5 rounded-xl transition-colors active:opacity-80"
          style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#9ca3af', border: '1px solid #374151' }}
        >
          Compartir Order Book
        </button>
      </div>

      {/* Info */}
      <div className="text-center text-[10px] py-2" style={{ color: '#6b7280' }}>
        Order Book v3.0 — Binance {sourceLabel}
      </div>
    </div>
  )

  return (
    <div className="h-screen bg-[#141821] text-white flex flex-col overflow-hidden">
      {/* Content */}
      {activeTab === 'orderbook' && renderOrderBook()}
      {activeTab === 'chart' && renderChart()}
      {activeTab === 'calc' && <Calculator
        orderBookPrices={{
          entrada: computed.entryPoint2,
          bloqueLong: computed.bloqueDeLong,
          bloqueTopeLong: computed.bloqueTopeLong,
          bloqueShort: computed.bloqueDeShort,
          bloqueTopeShort: computed.bloqueTopeShort,
        } as OrderBookPrices}
        onCalcResult={setCalcResult}
        onOrderActive={handleOrderActive}
        orderActive={orderActive}
        notifications={calcNotifications}
      />}
      {activeTab === 'history' && renderHistory()}
      {activeTab === 'settings' && renderSettings()}

      {/* Bottom Navigation */}
      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  )
}

export default App
