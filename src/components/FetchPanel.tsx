interface FetchPanelProps {
  onFetch: () => void
  loading: boolean
  error: string | null
  label: string
}

export function FetchPanel({ onFetch, loading, error, label }: FetchPanelProps) {
  return (
    <div className="px-3 py-2 bg-gray-800/80 border-b border-gray-700 space-y-2">
      <button
        onClick={onFetch}
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-blue-400 text-white font-bold text-sm py-2 px-4 rounded transition-colors"
      >
        {loading ? 'Cargando...' : label}
      </button>

      {error && (
        <div className="text-xs text-red-400 bg-red-900/30 rounded px-2 py-1">
          {error}
        </div>
      )}
    </div>
  )
}
