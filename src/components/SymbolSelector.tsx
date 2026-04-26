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
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const base = symbol.replace('USDT', '')
  const filtered = symbols.filter((s) =>
    s.base.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <>
      <button
        onClick={() => {
          setOpen(true)
          setSearch('')
        }}
        className="text-xs bg-yellow-500/20 text-yellow-400 font-bold px-3 py-1.5 rounded-full border border-yellow-500/30 active:bg-yellow-500/30 transition-colors"
      >
        {base} / USDT ▾
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-[#141821] flex flex-col">
          {/* Header with search */}
          <div className="bg-[#1a1f2e] px-4 pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-bold text-base">Seleccionar Moneda</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 active:text-white text-lg px-2"
              >
                ✕
              </button>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar moneda..."
              className="w-full bg-[#1e2536] text-white text-sm rounded-xl px-4 py-2.5 border border-gray-700 outline-none focus:border-yellow-500/50 placeholder-gray-500"
            />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {isPending && (
              <div className="text-sm text-gray-500 text-center py-8">
                Cargando...
              </div>
            )}
            {symbols.length === 0 && !isPending && (
              <div className="text-sm text-gray-500 text-center py-8">
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
                className={`w-full text-left text-sm px-3 py-3 flex items-center gap-3 rounded-xl mb-0.5 transition-colors ${
                  s.symbol === symbol
                    ? 'bg-yellow-500/15 text-yellow-400'
                    : 'text-gray-300 active:bg-[#1e2536]'
                }`}
              >
                <span className="text-gray-600 w-6 text-right font-mono text-xs">
                  {i + 1}
                </span>
                <span className="font-bold">{s.base}</span>
                <span className="text-gray-600 text-xs">/ USDT</span>
                {s.symbol === symbol && (
                  <span className="ml-auto text-yellow-400 text-xs">●</span>
                )}
              </button>
            ))}
            {symbols.length > 0 && filtered.length === 0 && (
              <div className="text-sm text-gray-500 text-center py-8">
                No se encontró &quot;{search}&quot;
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
