import { useState, useCallback, useEffect, useRef } from 'react'
import { useOrderBook, loadHistory, saveHistory } from './hooks/useOrderBook'
import type { HistoryEntry } from './hooks/useOrderBook'
import { useOrderBookFetch } from './hooks/useOrderBookFetch'
import { PriceInput } from './components/PriceInput'
import { BlockCard } from './components/BlockCard'
import { FetchPanel } from './components/FetchPanel'
import { SymbolSelector } from './components/SymbolSelector'
import { HistoryPanel } from './components/HistoryPanel'

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
  const { fetchOrderBook, loading, error } = useOrderBookFetch(symbol)

  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory())
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)

  // Alert state
  const [alertPrice, setAlertPrice] = useState<number | null>(null)
  const [alertDirection, setAlertDirection] = useState<'above' | 'below'>(
    'above',
  )
  const [showAlertForm, setShowAlertForm] = useState(false)
  const [alertDraft, setAlertDraft] = useState('')

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const appRef = useRef<HTMLDivElement>(null)

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

      // Save to history
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

      // Check alert
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

  // Keep ref to latest handleFetch for auto-refresh
  const fetchRef = useRef(handleFetch)
  useEffect(() => {
    fetchRef.current = handleFetch
  }, [handleFetch])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return

    // Initial fetch via setTimeout to avoid sync setState in effect
    const initTimer = setTimeout(() => fetchRef.current(), 0)

    const secs = AUTO_REFRESH_INTERVAL / 1000
    const startTime = Date.now()

    intervalRef.current = setInterval(() => {
      fetchRef.current()
    }, AUTO_REFRESH_INTERVAL)

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
      `LIBRO DE ORDENES - ${base}/USDT`,
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
      ...shortPrices.map(
        (p, i) => `  ${i + 1}. ${p.price.toLocaleString()}`,
      ),
      '',
      'LONG:',
      ...longPrices.map(
        (p, i) => `  ${i + 1}. ${p.price.toLocaleString()}`,
      ),
    ]
    const text = lines.filter((l) => l !== undefined).join('\n')

    if (navigator.share) {
      navigator
        .share({ title: `Order Book ${base}/USDT`, text })
        .catch(() => {})
    } else {
      navigator.clipboard.writeText(text).then(() => {
        alert('Datos copiados al portapapeles')
      })
    }
  }, [symbol, currentPrice, computed, shortPrices, longPrices])

  const base = symbol.replace('USDT', '')

  return (
    <div ref={appRef} className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-3 py-2">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-bold tracking-tight">LIBRO DE ORDENES</h1>
          <div className="flex items-center gap-2">
            <SymbolSelector symbol={symbol} onSymbolChange={setSymbol} />
          </div>
        </div>

        {/* Live price + toolbar */}
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-2">
            {currentPrice !== null && (
              <span className="text-sm font-bold text-yellow-400 tabular-nums">
                ${currentPrice.toLocaleString()}
              </span>
            )}
            {lastUpdate && (
              <span className="text-[10px] text-gray-500">{lastUpdate}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                autoRefresh
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-400'
              }`}
            >
              {autoRefresh ? `⟳ ${countdown}s` : '⟳ Auto'}
            </button>
            {/* Alert */}
            <button
              onClick={() => {
                setShowAlertForm(!showAlertForm)
                setAlertDraft(currentPrice?.toString() ?? '')
              }}
              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                alertPrice !== null
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-700 text-gray-400'
              }`}
            >
              {alertPrice !== null
                ? `🔔 $${alertPrice.toLocaleString()}`
                : '🔔'}
            </button>
            {/* History */}
            <button
              onClick={() => setShowHistory(true)}
              className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-gray-700 text-gray-400"
            >
              📊
            </button>
            {/* Export */}
            <button
              onClick={handleExport}
              className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-gray-700 text-gray-400"
            >
              📤
            </button>
          </div>
        </div>
      </header>

      {/* Alert form */}
      {showAlertForm && (
        <div className="bg-gray-800/95 px-3 py-2 border-b border-gray-700 space-y-1.5">
          <div className="text-xs text-gray-300 font-semibold">
            Alerta de Precio ({base})
          </div>
          <div className="flex gap-1.5 items-center">
            <select
              value={alertDirection}
              onChange={(e) =>
                setAlertDirection(e.target.value as 'above' | 'below')
              }
              className="bg-gray-700 text-white text-xs rounded px-1.5 py-1 border border-gray-600"
            >
              <option value="above">≥ Sube a</option>
              <option value="below">≤ Baja a</option>
            </select>
            <input
              type="number"
              value={alertDraft}
              onChange={(e) => setAlertDraft(e.target.value)}
              placeholder="Precio"
              className="flex-1 bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600 outline-none"
            />
            <button
              onClick={() => {
                const p = parseFloat(alertDraft)
                if (!isNaN(p)) {
                  setAlertPrice(p)
                  setShowAlertForm(false)
                }
              }}
              className="bg-orange-600 text-white text-xs font-bold px-2 py-1 rounded"
            >
              Activar
            </button>
            {alertPrice !== null && (
              <button
                onClick={() => {
                  setAlertPrice(null)
                  setShowAlertForm(false)
                }}
                className="bg-gray-600 text-white text-xs px-2 py-1 rounded"
              >
                Borrar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Fetch Panel */}
      <FetchPanel
        onFetch={handleFetch}
        loading={loading}
        error={error}
        label={`Obtener Datos (${base})`}
      />

      {/* Punto de Entrada */}
      <div className="bg-yellow-500 px-4 py-3 border-b border-yellow-600">
        <div className="text-xs font-semibold uppercase tracking-wider text-black/70 mb-0.5">
          Punto de Entrada
        </div>
        <div className="text-2xl font-bold tabular-nums text-black">
          {computed.entryPoint2.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
      </div>

      {/* Blocks Grid */}
      <div className="grid grid-cols-2 gap-2 px-3 py-3">
        <BlockCard
          label="Bloque Tope Short"
          value={computed.bloqueTopeShort}
          variant="short"
        />
        <BlockCard
          label="Bloque de Short"
          value={computed.bloqueDeShort}
          variant="short"
        />
        <BlockCard
          label="Bloque de Long"
          value={computed.bloqueDeLong}
          variant="long"
        />
        <BlockCard
          label="Bloque Tope Long"
          value={computed.bloqueTopeLong}
          variant="long"
        />
      </div>

      {/* Price Columns */}
      <div className="flex-1 px-3 pb-4">
        <div className="grid grid-cols-2 gap-3">
          {/* SHORT Column */}
          <div>
            <div className="bg-red-800 text-center font-bold text-sm py-2 rounded-t-lg uppercase tracking-wider">
              Short
            </div>
            <div className="bg-gray-800/50 rounded-b-lg p-2 space-y-1.5">
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
                className="w-full text-center text-xs text-red-400 border border-dashed border-red-700 rounded py-1.5 hover:bg-red-900/30 transition-colors"
              >
                + Agregar
              </button>
            </div>
          </div>

          {/* LONG Column */}
          <div>
            <div className="bg-green-700 text-center font-bold text-sm py-2 rounded-t-lg uppercase tracking-wider">
              Long
            </div>
            <div className="bg-gray-800/50 rounded-b-lg p-2 space-y-1.5">
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
                className="w-full text-center text-xs text-green-400 border border-dashed border-green-700 rounded py-1.5 hover:bg-green-900/30 transition-colors"
              >
                + Agregar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 border-t border-gray-700 px-4 py-3 flex justify-between text-xs">
        <div>
          <span className="text-gray-400">Prom. Short: </span>
          <span className="font-bold text-red-400 tabular-nums">
            {computed.avgShort.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        <div>
          <span className="text-gray-400">Prom. Long: </span>
          <span className="font-bold text-green-400 tabular-nums">
            {computed.avgLong.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      </footer>

      {/* History Panel */}
      {showHistory && (
        <HistoryPanel
          entries={history}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  )
}

export default App
