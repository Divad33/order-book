import { useState, useCallback } from 'react'
import { useOrderBook } from './hooks/useOrderBook'
import { useOrderBookFetch, type FetchSource } from './hooks/useOrderBookFetch'
import { PriceInput } from './components/PriceInput'
import { BlockCard } from './components/BlockCard'
import { FetchPanel } from './components/FetchPanel'

function App() {
  const {
    shortPrices,
    longPrices,
    computed,
    updateShortPrice,
    updateLongPrice,
    addShortPrice,
    addLongPrice,
    removeShortPrice,
    removeLongPrice,
    loadPrices,
  } = useOrderBook()

  const [source, setSource] = useState<FetchSource>('binance-futures')
  const { fetchOrderBook, loading, error } = useOrderBookFetch(source)

  const handleFetch = useCallback(async () => {
    const result = await fetchOrderBook()
    if (result) {
      loadPrices(result.shortPrices, result.longPrices)
    }
  }, [fetchOrderBook, loadPrices])

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">
          LIBRO DE ORDENES
        </h1>
        <span className="text-xs bg-yellow-600 text-white font-bold px-2 py-0.5 rounded">
          BTC / USDT
        </span>
      </header>

      {/* Fetch Panel */}
      <FetchPanel
        onFetch={handleFetch}
        loading={loading}
        error={error}
        source={source}
        onSourceChange={setSource}
      />

      {/* Entry Point Banner */}
      <div className="bg-green-700 px-4 py-3 border-b border-green-600">
        <div className="text-xs font-semibold uppercase tracking-wider text-green-200 mb-0.5">
          Punto de Entrada
        </div>
        <div className="text-2xl font-bold tabular-nums text-white">
          {computed.entryPoint.toLocaleString(undefined, {
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

      {/* Second Entry Point */}
      <div className="mx-3 mb-3">
        <BlockCard
          label="Punto de Entrada (Alt)"
          value={computed.entryPoint2}
          variant="entry"
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
              {shortPrices.map((price, i) => (
                <div key={i} className="group">
                  <PriceInput
                    value={price}
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
              {longPrices.map((price, i) => (
                <div key={i} className="group">
                  <PriceInput
                    value={price}
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

      {/* Footer with averages */}
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
    </div>
  )
}

export default App
