import { useState, useEffect, useRef, useTransition } from 'react'

interface SymbolSelectorProps {
  symbol: string
  onSymbolChange: (symbol: string) => void
}

interface SymbolInfo {
  symbol: string
  base: string
}

const STABLECOINS = new Set([
  'USDC', 'BUSD', 'FDUSD', 'TUSD', 'DAI', 'USDP', 'FRAX', 'SUSD',
  'USDE', 'RLUSD', 'USD1', 'USDS', 'EURI', 'AEUR', 'BFUSD', 'XUSD',
  'BKRW', 'EUR', 'GBP', 'AUD', 'PAX', 'USDSOLD', 'USDSB', 'WBTC',
  'BETH', 'WBETH', 'BNSOL', 'PAXG', 'XAUT',
])

const DELISTED = new Set([
  'BCC', 'VEN', 'BCHABC', 'BCHSV', 'BTT', 'NANO', 'ERD', 'NPXS',
  'STORM', 'HC', 'MCO', 'BULL', 'BEAR', 'ETHBULL', 'ETHBEAR',
  'EOSBULL', 'EOSBEAR', 'XRPBULL', 'XRPBEAR', 'STRAT', 'BNBBULL',
  'BNBBEAR', 'XZC', 'GXS', 'LEND', 'BZRX', 'RAMP', 'EPS', 'NU',
  'KEEP', 'RGT', 'ANY', 'UST',
])

export function SymbolSelector({ symbol, onSymbolChange }: SymbolSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [symbols, setSymbols] = useState<SymbolInfo[]>([])
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || symbols.length > 0) return

    const controller = new AbortController()
    fetch('https://data-api.binance.vision/api/v3/ticker/24hr', {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data: { symbol: string; quoteVolume: string }[]) => {
        const usdt = data
          .filter((d) => {
            if (!d.symbol.endsWith('USDT')) return false
            const base = d.symbol.replace('USDT', '')
            if (STABLECOINS.has(base)) return false
            if (DELISTED.has(base)) return false
            if (base.includes('DOWN') || base.includes('UP')) return false
            return true
          })
          .sort(
            (a, b) =>
              parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume),
          )
          .map((d) => ({
            symbol: d.symbol,
            base: d.symbol.replace('USDT', ''),
          }))
        startTransition(() => setSymbols(usdt))
      })
      .catch(() => {})

    return () => controller.abort()
  }, [open, symbols.length])

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  const base = symbol.replace('USDT', '')
  const filtered = symbols.filter((s) =>
    s.base.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen(!open)
          setSearch('')
        }}
        className="text-xs bg-yellow-600 text-white font-bold px-2 py-1 rounded active:bg-yellow-500 transition-colors"
      >
        {base} / USDT ▾
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 max-h-80 flex flex-col">
          <div className="p-2 border-b border-gray-700">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar moneda..."
              className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5 border border-gray-600 outline-none focus:border-blue-500"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {isPending && (
              <div className="text-xs text-gray-400 text-center py-4">
                Cargando...
              </div>
            )}
            {symbols.length === 0 && !isPending && (
              <div className="text-xs text-gray-400 text-center py-4">
                Cargando monedas...
              </div>
            )}
            {filtered.map((s, i) => (
              <button
                key={s.symbol}
                onClick={() => {
                  onSymbolChange(s.symbol)
                  setOpen(false)
                }}
                className={`w-full text-left text-xs px-3 py-2 flex items-center gap-2 transition-colors ${
                  s.symbol === symbol
                    ? 'bg-yellow-600 text-white font-bold'
                    : 'text-gray-300 active:bg-gray-700'
                }`}
              >
                <span className="text-gray-500 w-5 text-right font-mono">
                  {i + 1}
                </span>
                <span className="font-semibold">{s.base}</span>
                <span className="text-gray-500">/ USDT</span>
              </button>
            ))}
            {symbols.length > 0 && filtered.length === 0 && (
              <div className="text-xs text-gray-500 text-center py-4">
                No se encontró &quot;{search}&quot;
              </div>
            )}
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </div>
  )
}
