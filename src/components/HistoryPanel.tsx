import type { HistoryEntry } from '../hooks/useOrderBook'

interface HistoryPanelProps {
  entries: HistoryEntry[]
  onClose: () => void
}

export function HistoryPanel({ entries, onClose }: HistoryPanelProps) {
  const reversed = [...entries].reverse()

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <h2 className="text-white font-bold">Historial de Precios</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-xl px-2"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {reversed.length === 0 && (
          <div className="text-gray-500 text-center py-8 text-sm">
            Aún no hay historial. Obtén datos para empezar.
          </div>
        )}
        {reversed.map((e, i) => {
          const d = new Date(e.timestamp)
          const time = d.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })
          const date = d.toLocaleDateString([], {
            day: '2-digit',
            month: '2-digit',
          })

          return (
            <div
              key={i}
              className="bg-gray-800/80 border border-gray-700 rounded-lg p-3"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs bg-yellow-600 text-white font-bold px-1.5 py-0.5 rounded">
                  {e.symbol.replace('USDT', '')}
                </span>
                <span className="text-xs text-gray-400">
                  {date} {time}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-400">Precio: </span>
                  <span className="text-white font-bold">
                    {e.currentPrice.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Entrada: </span>
                  <span className="text-yellow-400 font-bold">
                    {e.entryPoint.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Short: </span>
                  <span className="text-red-400 font-bold">
                    {e.avgShort.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Long: </span>
                  <span className="text-green-400 font-bold">
                    {e.avgLong.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
