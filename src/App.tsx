import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useOrderBook, loadHistory, saveHistory } from './hooks/useOrderBook'
import type { HistoryEntry } from './hooks/useOrderBook'
import { useOrderBookFetch } from './hooks/useOrderBookFetch'
import type { DataSource } from './hooks/useOrderBookFetch'
import { PriceInput } from './components/PriceInput'
import { SymbolSelector } from './components/SymbolSelector'
import { ChartScreen } from './components/ChartScreen'
import type { OverlayLine } from './components/CandlestickChart'
import { BottomNav } from './components/BottomNav'
import type { TabId } from './components/BottomNav'
import { IconRefresh, IconShare, IconBell } from './components/Icons'

const AUTO_REFRESH_INTERVAL = 30_000

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
  const [countdown, setCountdown] = useState(0)
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory())
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('orderbook')

  // Alert state
  const [alertPrice, setAlertPrice] = useState<number | null>(null)
  const [alertDirection, setAlertDirection] = useState<'above' | 'below'>('above')
  const [alertDraft, setAlertDraft] = useState('')

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Save data source preference
  useEffect(() => {
    localStorage.setItem('ob_dataSource', dataSource)
  }, [dataSource])

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

      if (alertPrice !== null) {
        const triggered =
          alertDirection === 'above'
            ? result.currentPrice >= alertPrice
            : result.currentPrice <= alertPrice
        if (triggered) {
          if ('vibrate' in navigator) navigator.vibrate([200, 100, 200])
          alert(
            `${symbol.replace('USDT', '')} llegó a $${result.currentPrice.toLocaleString()} (alerta: ${alertDirection === 'above' ? '≥' : '≤'} $${alertPrice.toLocaleString()})`,
          )
          setAlertPrice(null)
        }
      }
    }
  }, [fetchOrderBook, loadPrices, symbol, alertPrice, alertDirection])

  const fetchRef = useRef(handleFetch)
  useEffect(() => {
    fetchRef.current = handleFetch
  }, [handleFetch])

  useEffect(() => {
    if (!autoRefresh) return
    const initTimer = setTimeout(() => fetchRef.current(), 0)
    const secs = AUTO_REFRESH_INTERVAL / 1000
    const startTime = Date.now()
    intervalRef.current = setInterval(() => fetchRef.current(), AUTO_REFRESH_INTERVAL)
    countdownRef.current = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000) % secs
      setCountdown(Math.max(0, Math.round(secs - elapsed)))
    }, 1000)
    return () => {
      clearTimeout(initTimer)
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [autoRefresh])

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
      {/* Symbol + Price Card */}
      <div className="px-4 pt-4 pb-2">
        <div className="bg-[#1e2536] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  autoRefresh
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-gray-700/50 text-gray-400 border border-gray-600/30'
                }`}
              >
                <IconRefresh size={14} className={loading ? 'animate-spin' : ''} />
                {autoRefresh ? `${countdown}s` : 'Auto'}
              </button>
              <span className="text-[10px] text-gray-500 bg-gray-700/30 px-2 py-0.5 rounded-full">
                {sourceLabel}
              </span>
            </div>
            <SymbolSelector symbol={symbol} onSymbolChange={setSymbol} />
          </div>

          {/* Current Price */}
          {currentPrice !== null ? (
            <div className="mb-1">
              <span className="text-3xl font-bold text-white tabular-nums tracking-tight">
                ${currentPrice.toLocaleString()}
              </span>
              {lastUpdate && (
                <span className="text-xs text-gray-500 ml-2">{lastUpdate}</span>
              )}
            </div>
          ) : (
            <div className="text-gray-500 text-sm mb-1">Ve a Ajustes para obtener datos</div>
          )}
          {error && (
            <div className="text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-1.5 mt-2">
              {error}
            </div>
          )}
        </div>
      </div>

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
        <div className="bg-[#1e2536] rounded-xl p-3">
          <div className="text-[10px] font-medium text-red-400/60 uppercase tracking-wider mb-1">
            Bloque Tope Short
          </div>
          <div className="text-sm font-bold text-red-400 tabular-nums">{fmt(computed.bloqueTopeShort)}</div>
        </div>
        <div className="bg-[#1e2536] rounded-xl p-3">
          <div className="text-[10px] font-medium text-red-400/60 uppercase tracking-wider mb-1">
            Bloque de Short
          </div>
          <div className="text-sm font-bold text-red-400 tabular-nums">{fmt(computed.bloqueDeShort)}</div>
        </div>
        <div className="bg-[#1e2536] rounded-xl p-3">
          <div className="text-[10px] font-medium text-green-400/60 uppercase tracking-wider mb-1">
            Bloque de Long
          </div>
          <div className="text-sm font-bold text-green-400 tabular-nums">{fmt(computed.bloqueDeLong)}</div>
        </div>
        <div className="bg-[#1e2536] rounded-xl p-3">
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
            <div className="bg-[#1e2536] rounded-b-xl p-2 space-y-1">
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
            <div className="bg-[#1e2536] rounded-b-xl p-2 space-y-1">
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
        <div className="bg-[#1e2536] rounded-xl px-4 py-2.5 flex justify-between text-xs">
          <div>
            <span className="text-gray-500">Prom. Short: </span>
            <span className="font-bold text-red-400 tabular-nums">{fmt(computed.avgShort)}</span>
          </div>
          <div>
            <span className="text-gray-500">Prom. Long: </span>
            <span className="font-bold text-green-400 tabular-nums">{fmt(computed.avgLong)}</span>
          </div>
        </div>
      </div>
    </div>
  )

  // ─── Tab: Chart ──────────────────────────────────
  const renderChart = () => (
    <div className="flex-1 flex flex-col">
      <ChartScreen symbol={symbol} onClose={() => setActiveTab('orderbook')} embedded overlayLines={chartOverlayLines} dataSourceLabel={sourceLabel} />
    </div>
  )

  // ─── Tab: History ────────────────────────────────
  const renderHistory = () => {
    const reversed = [...history].reverse()
    return (
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        <h2 className="text-lg font-bold text-white mb-3">Historial</h2>
        {reversed.length === 0 ? (
          <div className="text-gray-500 text-center py-12 text-sm">
            Aún no hay historial. Obtén datos para empezar.
          </div>
        ) : (
          <div className="space-y-2">
            {reversed.map((e, i) => {
              const d = new Date(e.timestamp)
              const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              const date = d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
              return (
                <div key={i} className="bg-[#1e2536] rounded-xl p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs bg-yellow-500/20 text-yellow-400 font-bold px-2 py-0.5 rounded-full">
                      {e.symbol.replace('USDT', '')}
                    </span>
                    <span className="text-xs text-gray-500">{date} {time}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Precio: </span>
                      <span className="text-white font-bold">{e.currentPrice.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Entrada: </span>
                      <span className="text-yellow-400 font-bold">
                        {e.entryPoint.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Short: </span>
                      <span className="text-red-400 font-bold">
                        {e.avgShort.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Long: </span>
                      <span className="text-green-400 font-bold">
                        {e.avgLong.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ─── Tab: Settings (Alerts + Config) ─────────────
  const renderSettings = () => (
    <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-4">
      <h2 className="text-lg font-bold text-white">Ajustes</h2>

      {/* Fetch Data section */}
      <div className="bg-[#1e2536] rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <IconRefresh size={18} className="text-yellow-400" />
          <h3 className="text-sm font-bold text-white">Obtener Datos</h3>
        </div>

        {/* Data source selector */}
        <div className="mb-3">
          <div className="text-xs text-gray-400 mb-2">Fuente de datos:</div>
          <div className="flex gap-2">
            <button
              onClick={() => setDataSource('spot')}
              className={`flex-1 text-xs font-bold py-2 rounded-xl transition-colors ${
                dataSource === 'spot'
                  ? 'bg-yellow-500 text-black'
                  : 'bg-gray-700/50 text-gray-400 border border-gray-600/30'
              }`}
            >
              Spot
            </button>
            <button
              onClick={() => setDataSource('futures')}
              className={`flex-1 text-xs font-bold py-2 rounded-xl transition-colors ${
                dataSource === 'futures'
                  ? 'bg-yellow-500 text-black'
                  : 'bg-gray-700/50 text-gray-400 border border-gray-600/30'
              }`}
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
          <div className="text-[10px] text-gray-500 mt-2">
            Futures puede dar error 451 si está bloqueado en tu región.
          </div>
        )}
      </div>

      {/* Alert section */}
      <div className="bg-[#1e2536] rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <IconBell size={18} className="text-yellow-400" />
          <h3 className="text-sm font-bold text-white">Alerta de Precio</h3>
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

        <div className="space-y-2">
          <div className="text-xs text-gray-400">Notificar cuando {base} llegue a:</div>
          <div className="flex gap-2">
            <select
              value={alertDirection}
              onChange={(e) => setAlertDirection(e.target.value as 'above' | 'below')}
              className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2 border border-gray-700 outline-none"
            >
              <option value="above">≥ Sube a</option>
              <option value="below">≤ Baja a</option>
            </select>
            <input
              type="number"
              value={alertDraft}
              onChange={(e) => setAlertDraft(e.target.value)}
              placeholder="Precio"
              className="flex-1 bg-gray-800 text-white text-xs rounded-lg px-3 py-2 border border-gray-700 outline-none"
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
      <div className="bg-[#1e2536] rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <IconRefresh size={18} className="text-yellow-400" />
          <h3 className="text-sm font-bold text-white">Auto-Refresh</h3>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Actualizar cada 30 segundos</span>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              autoRefresh ? 'bg-green-500' : 'bg-gray-600'
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                autoRefresh ? 'translate-x-5.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        {autoRefresh && (
          <div className="text-xs text-green-400 mt-2">
            Próxima actualización en {countdown}s
          </div>
        )}
      </div>

      {/* Export section */}
      <div className="bg-[#1e2536] rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <IconShare size={18} className="text-yellow-400" />
          <h3 className="text-sm font-bold text-white">Exportar Datos</h3>
        </div>
        <button
          onClick={handleExport}
          className="w-full bg-gray-700/50 text-gray-300 text-sm font-medium py-2.5 rounded-xl border border-gray-600/30 active:bg-gray-600/50 transition-colors"
        >
          Compartir Order Book
        </button>
      </div>

      {/* Info */}
      <div className="text-center text-[10px] text-gray-600 py-2">
        Order Book v2.1 — Binance {sourceLabel}
      </div>
    </div>
  )

  return (
    <div className="h-screen bg-[#141821] text-white flex flex-col overflow-hidden">
      {/* Content */}
      {activeTab === 'orderbook' && renderOrderBook()}
      {activeTab === 'chart' && renderChart()}
      {activeTab === 'history' && renderHistory()}
      {activeTab === 'settings' && renderSettings()}

      {/* Bottom Navigation */}
      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  )
}

export default App
