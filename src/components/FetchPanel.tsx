import { useState } from 'react'
import type { FetchSource } from '../hooks/useOrderBookFetch'

interface FetchPanelProps {
  onFetch: () => void
  loading: boolean
  error: string | null
  source: FetchSource
  onSourceChange: (source: FetchSource) => void
  coinglassApiKey: string
  onCoinglassApiKeyChange: (key: string) => void
}

export function FetchPanel({
  onFetch,
  loading,
  error,
  source,
  onSourceChange,
  coinglassApiKey,
  onCoinglassApiKeyChange,
}: FetchPanelProps) {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="px-3 py-2 bg-gray-800/80 border-b border-gray-700">
      <div className="flex items-center gap-2">
        <button
          onClick={onFetch}
          disabled={loading}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-blue-400 text-white font-bold text-sm py-2 px-4 rounded transition-colors"
        >
          {loading ? 'Cargando...' : 'Obtener Datos Automáticamente'}
        </button>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded transition-colors text-sm"
          aria-label="Configuración"
        >
          {showSettings ? 'X' : 'Cfg'}
        </button>
      </div>

      {error && (
        <div className="mt-2 text-xs text-red-400 bg-red-900/30 rounded px-2 py-1">
          {error}
        </div>
      )}

      {showSettings && (
        <div className="mt-2 space-y-2">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Fuente de datos</label>
            <div className="flex gap-2">
              <button
                onClick={() => onSourceChange('okx')}
                className={`flex-1 text-xs py-1.5 rounded font-semibold transition-colors ${
                  source === 'okx'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                OKX (Gratis)
              </button>
              <button
                onClick={() => onSourceChange('coinglass')}
                className={`flex-1 text-xs py-1.5 rounded font-semibold transition-colors ${
                  source === 'coinglass'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                CoinGlass (API Key)
              </button>
            </div>
          </div>

          {source === 'coinglass' && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                CoinGlass API Key
              </label>
              <input
                type="password"
                value={coinglassApiKey}
                onChange={(e) => onCoinglassApiKeyChange(e.target.value)}
                placeholder="Tu API key de CoinGlass"
                className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5 border border-gray-600 outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Obtén tu key en{' '}
                <a
                  href="https://www.coinglass.com/pricing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline"
                >
                  coinglass.com/pricing
                </a>{' '}
                (desde $29/mes)
              </p>
            </div>
          )}

          {source === 'okx' && (
            <p className="text-xs text-gray-500">
              Usa la API pública de OKX Futures para obtener el order book de BTC/USDT.
              No requiere API key. Agrupa los precios por niveles de $100.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
