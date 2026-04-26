import { type FetchSource, SOURCE_LABELS } from '../hooks/useOrderBookFetch'

const SOURCES: FetchSource[] = ['binance-futures', 'binance-spot']

interface FetchPanelProps {
  onFetch: () => void
  loading: boolean
  error: string | null
  source: FetchSource
  onSourceChange: (source: FetchSource) => void
}

export function FetchPanel({
  onFetch,
  loading,
  error,
  source,
  onSourceChange,
}: FetchPanelProps) {
  return (
    <div className="px-3 py-2 bg-gray-800/80 border-b border-gray-700 space-y-2">
      {/* Source selector */}
      <div className="flex gap-1">
        {SOURCES.map((s) => (
          <button
            key={s}
            onClick={() => onSourceChange(s)}
            className={`flex-1 text-xs py-1.5 rounded font-semibold transition-colors ${
              source === s
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-700 text-gray-300 active:bg-gray-600'
            }`}
          >
            {SOURCE_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Fetch button */}
      <button
        onClick={onFetch}
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-blue-400 text-white font-bold text-sm py-2 px-4 rounded transition-colors"
      >
        {loading ? 'Cargando...' : `Obtener Datos (${SOURCE_LABELS[source]})`}
      </button>

      {error && (
        <div className="text-xs text-red-400 bg-red-900/30 rounded px-2 py-1">
          {error}
        </div>
      )}
    </div>
  )
}
