
import { useState, useMemo, useCallback, useEffect } from 'react'
import { IconCalculator } from './Icons'

export type Position = 'LONG' | 'SHORT'
type OrderType = 'LIMITE' | 'MARKET'

export interface CalcInputs {
  position: Position
  rebuyPct: number
  coinPct: number
  stopLossUsd: number
  entryPrice: number
  numCoins: number
  takeProfitPct: number
  leverage: number
  orderType: OrderType
  capital: number
  decimals: number
  mmRate: number
}

export interface RecompraRow {
  num: number
  recompraPrice: number
  coins: number
  avgEntry: number
  slPartial: number
  totalCoins: number
  tpPrice: number
  tpUsd: number
  usdtUsed: number
  usdtLev: number
  comEntry: number
  comTpLimit: number
  comTpMarket: number
  liqPrice: number
}

const STORAGE_KEY = 'ob_calc'

function loadSaved(): CalcInputs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {
    position: 'LONG',
    rebuyPct: 1.75,
    coinPct: 20,
    stopLossUsd: 30,
    entryPrice: 12,
    numCoins: 75,
    takeProfitPct: 1.5,
    leverage: 10,
    orderType: 'LIMITE',
    capital: 162.31,
    decimals: 5,
    mmRate: 0.005,
  }
}

function compute(inp: CalcInputs): { rows: RecompraRow[]; tpNoRecompra: number; tpNoRecompraUsd: number; lastSl: number; lastSlPct: number; liqPrice: number; liqPct: number; initCom: number; comTpLimit: number; comTpMarket: number } {
  const { position, rebuyPct, coinPct, stopLossUsd, entryPrice, numCoins, takeProfitPct, leverage, capital, mmRate } = inp
  const isShort = position === 'SHORT'

  const tpNoRecompra = isShort
    ? entryPrice * (1 - takeProfitPct / 100)
    : entryPrice * (1 + takeProfitPct / 100)
  const tpNoRecompraUsd = entryPrice * numCoins * (takeProfitPct / 100)

  const comRate = inp.orderType === 'MARKET' ? 0.0004 : 0.0002
  const initCom = entryPrice * numCoins * comRate
  const comTpLimit = tpNoRecompra * numCoins * 0.0002
  const comTpMarket = tpNoRecompra * numCoins * 0.0004

  const calcLiq = (ep: number, tc: number) => {
    const notional = ep * tc
    const maintMargin = notional * mmRate
    if (isShort) {
      return (notional + capital * leverage - maintMargin) / tc
    } else {
      return (notional - capital * leverage + maintMargin) / tc
    }
  }

  const initLiq = calcLiq(entryPrice, numCoins)

  const rows: RecompraRow[] = []
  let prevRecompraPrice = entryPrice
  let prevAvgEntry = entryPrice
  let prevTotalCoins = numCoins
  let prevExtraCoins = numCoins
  for (let i = 1; i <= 9; i++) {
    const recompraPrice = i === 1
      ? (isShort ? entryPrice * (1 + rebuyPct / 100) : entryPrice * (1 - rebuyPct / 100))
      : (isShort ? prevRecompraPrice * (1 + rebuyPct / 100) : prevRecompraPrice * (1 - rebuyPct / 100))

    const extraCoins = i === 1
      ? numCoins * (1 + coinPct / 100)
      : prevExtraCoins * (1 + coinPct / 100)

    const totalCoins = prevTotalCoins + extraCoins
    const avgEntry = (prevAvgEntry * prevTotalCoins + extraCoins * recompraPrice) / totalCoins

    const sl = isShort
      ? stopLossUsd / totalCoins + avgEntry
      : avgEntry - stopLossUsd / totalCoins

    const tpBase = i === 1 ? entryPrice : prevAvgEntry
    const tpPrice = isShort
      ? tpBase * (1 - takeProfitPct / 100)
      : tpBase * (1 + takeProfitPct / 100)
    const tpUsd = prevTotalCoins * tpBase * (takeProfitPct / 100)

    const usdtUsed = totalCoins * avgEntry / leverage
    const usdtLev = usdtUsed * leverage

    const comEntry = recompraPrice * extraCoins * 0.0002
    const comTpLimitRow = tpPrice * totalCoins * 0.0002
    const comTpMarketRow = tpPrice * totalCoins * 0.0004

    const liqPrice = calcLiq(avgEntry, totalCoins)

    rows.push({
      num: i,
      recompraPrice,
      coins: extraCoins,
      avgEntry,
      slPartial: sl,
      totalCoins,
      tpPrice,
      tpUsd,
      usdtUsed,
      usdtLev,
      comEntry,
      comTpLimit: comTpLimitRow,
      comTpMarket: comTpMarketRow,
      liqPrice: liqPrice > 0 ? liqPrice : 0,
    })

    prevRecompraPrice = recompraPrice
    prevAvgEntry = avgEntry
    prevTotalCoins = totalCoins
    prevExtraCoins = extraCoins
  }

  const lastSl = rows.length > 0 ? rows[rows.length - 1].slPartial : (isShort ? stopLossUsd / numCoins + entryPrice : entryPrice - stopLossUsd / numCoins)
  const lastSlPct = isShort
    ? (lastSl / entryPrice) - 1
    : 1 - (lastSl / entryPrice)

  const liqPriceFinal = rows.length > 0 ? rows[rows.length - 1].liqPrice : initLiq
  const liqPct = isShort
    ? (liqPriceFinal / entryPrice) - 1
    : 1 - (liqPriceFinal / entryPrice)

  return { rows, tpNoRecompra, tpNoRecompraUsd, lastSl, lastSlPct, liqPrice: liqPriceFinal, liqPct, initCom, comTpLimit, comTpMarket }
}

function fmt(n: number, dec: number): string {
  if (!isFinite(n) || isNaN(n)) return '—'
  return n.toFixed(dec)
}

export interface CalcResult {
  entryPrice: number
  position: Position
  tpNoRecompra: number
  lastSl: number
  liqPrice: number
  numCoins: number
  stopLossUsd: number
  takeProfitPct: number
  leverage: number
  rows: RecompraRow[]
}

export interface CalcNotification {
  id: string
  msg: string
  time: string
  type: 'entry' | 'tp' | 'sl' | 'recompra' | 'liq'
}

export interface OrderBookPrices {
  entrada: number
  bloqueLong: number
  bloqueTopeLong: number
  bloqueShort: number
  bloqueTopeShort: number
}

interface CalculatorProps {
  orderBookPrices?: OrderBookPrices | null
  onCalcResult?: (result: CalcResult) => void
  onOrderActive?: (active: boolean) => void
  notifications?: CalcNotification[]
  orderActive?: boolean
}

export function Calculator({ orderBookPrices, onCalcResult, onOrderActive, notifications, orderActive }: CalculatorProps) {
  const [inputs, setInputs] = useState<CalcInputs>(loadSaved)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs))
  }, [inputs])

  const update = useCallback(<K extends keyof CalcInputs>(key: K, val: CalcInputs[K]) => {
    setInputs(prev => ({ ...prev, [key]: val }))
  }, [])

  const result = useMemo(() => compute(inputs), [inputs])
  const d = inputs.decimals

  useEffect(() => {
    if (onCalcResult) {
      onCalcResult({
        entryPrice: inputs.entryPrice,
        position: inputs.position,
        tpNoRecompra: result.tpNoRecompra,
        lastSl: result.lastSl,
        liqPrice: result.liqPrice,
        numCoins: inputs.numCoins,
        stopLossUsd: inputs.stopLossUsd,
        takeProfitPct: inputs.takeProfitPct,
        leverage: inputs.leverage,
        rows: result.rows,
      })
    }
  }, [inputs, result, onCalcResult])

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3" style={{ backgroundColor: '#141821' }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <IconCalculator size={22} className="text-yellow-400" />
        <h2 className="text-base font-bold text-white">Calculadora de Trading</h2>
      </div>

      {/* Notifications */}
      {notifications && notifications.length > 0 && (
        <div className="rounded-2xl p-3 space-y-1.5" style={{ backgroundColor: '#1e2536' }}>
          <h3 className="text-xs font-bold text-white mb-1">Alertas de Ordenes</h3>
          {notifications.slice(0, 5).map(n => {
            const color = n.type === 'tp' ? '#22c55e' : n.type === 'sl' || n.type === 'liq' ? '#ef4444' : n.type === 'entry' ? '#818cf8' : '#a78bfa'
            return (
              <div key={n.id + n.time} className="flex items-center gap-2 text-[11px] px-2 py-1.5 rounded-lg" style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}>
                <span style={{ color }}>{n.type === 'tp' ? 'TP' : n.type === 'sl' ? 'SL' : n.type === 'liq' ? 'LIQ' : 'ENT'}</span>
                <span className="flex-1 text-white">{n.msg}</span>
                <span style={{ color: '#6b7280' }}>{n.time}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Position selector */}
      <div className="rounded-2xl p-3" style={{ backgroundColor: '#1e2536' }}>
        <label className="text-[10px] font-medium mb-2 block" style={{ color: '#9ca3af' }}>Posicion</label>
        <div className="flex gap-2">
          {(['LONG', 'SHORT'] as const).map(p => (
            <button
              key={p}
              onClick={() => update('position', p)}
              className="flex-1 py-2 rounded-xl text-xs font-bold transition-colors"
              style={{
                backgroundColor: inputs.position === p
                  ? (p === 'LONG' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)')
                  : 'rgba(255,255,255,0.05)',
                color: inputs.position === p
                  ? (p === 'LONG' ? '#22c55e' : '#ef4444')
                  : '#6b7280',
                border: inputs.position === p
                  ? `1px solid ${p === 'LONG' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`
                  : '1px solid rgba(75,85,99,0.3)',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Inputs grid */}
      <div className="rounded-2xl p-3" style={{ backgroundColor: '#1e2536' }}>
        <div className="grid grid-cols-2 gap-2">
          <InputField label="Precio Entrada $" value={inputs.entryPrice} onChange={v => update('entryPrice', v)} />
          <InputField label="# Monedas" value={inputs.numCoins} onChange={v => update('numCoins', v)} />
          <InputField label="Capital $" value={inputs.capital} onChange={v => update('capital', v)} />
          <InputField label="Apalancamiento" value={inputs.leverage} onChange={v => update('leverage', Math.min(Math.max(1, v), 125))} suffix="x" />
          <InputField label="Recompra %" value={inputs.rebuyPct} onChange={v => update('rebuyPct', v)} />
          <InputField label="Moneda %" value={inputs.coinPct} onChange={v => update('coinPct', v)} />
          <InputField label="Stop Loss $" value={inputs.stopLossUsd} onChange={v => update('stopLossUsd', v)} />
          <InputField label="Take Profit %" value={inputs.takeProfitPct} onChange={v => update('takeProfitPct', v)} />
          <InputField label="# Decimales" value={inputs.decimals} onChange={v => update('decimals', Math.min(Math.max(0, v), 8))} />
          <InputField label="MM Rate %" value={inputs.mmRate * 100} onChange={v => update('mmRate', Math.max(0, v) / 100)} suffix="%" />
          <div>
            <label className="text-[10px] font-medium mb-1 block" style={{ color: '#9ca3af' }}>Tipo Orden</label>
            <div className="flex gap-1">
              {(['LIMITE', 'MARKET'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => update('orderType', t)}
                  className="flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-colors"
                  style={{
                    backgroundColor: inputs.orderType === t ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)',
                    color: inputs.orderType === t ? '#f59e0b' : '#6b7280',
                    border: inputs.orderType === t ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(75,85,99,0.3)',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Order Book price buttons */}
        {orderBookPrices && (
          <div className="mt-2 space-y-2">
            {inputs.position === 'LONG' ? (
              <>
                <p className="text-[9px] font-bold" style={{ color: '#22c55e' }}>Precios del Order Book (LONG)</p>
                <div className="flex gap-1.5">
                  {[
                    { label: 'Entrada', price: orderBookPrices.entrada, color: '#fbbf24' },
                    { label: 'B.Long', price: orderBookPrices.bloqueLong, color: '#4ade80' },
                    { label: 'T.Long', price: orderBookPrices.bloqueTopeLong, color: '#22c55e' },
                  ].map(btn => (
                    <button
                      key={btn.label}
                      onClick={() => btn.price > 0 && update('entryPrice', btn.price)}
                      className="flex-1 py-1.5 rounded-lg text-[9px] font-bold transition-colors"
                      style={{
                        backgroundColor: `${btn.color}15`,
                        color: btn.color,
                        border: `1px solid ${btn.color}30`,
                        opacity: btn.price > 0 ? 1 : 0.4,
                      }}
                    >
                      {btn.label}
                      <br />
                      <span className="text-[8px]">${btn.price > 0 ? fmt(btn.price, 2) : '—'}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-[9px] font-bold" style={{ color: '#ef4444' }}>Precios del Order Book (SHORT)</p>
                <div className="flex gap-1.5">
                  {[
                    { label: 'Entrada', price: orderBookPrices.entrada, color: '#fbbf24' },
                    { label: 'B.Short', price: orderBookPrices.bloqueShort, color: '#f87171' },
                    { label: 'T.Short', price: orderBookPrices.bloqueTopeShort, color: '#ef4444' },
                  ].map(btn => (
                    <button
                      key={btn.label}
                      onClick={() => btn.price > 0 && update('entryPrice', btn.price)}
                      className="flex-1 py-1.5 rounded-lg text-[9px] font-bold transition-colors"
                      style={{
                        backgroundColor: `${btn.color}15`,
                        color: btn.color,
                        border: `1px solid ${btn.color}30`,
                        opacity: btn.price > 0 ? 1 : 0.4,
                      }}
                    >
                      {btn.label}
                      <br />
                      <span className="text-[8px]">${btn.price > 0 ? fmt(btn.price, 2) : '—'}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Execute order button */}
            <button
              onClick={() => onOrderActive?.(!orderActive)}
              className="w-full py-2 rounded-xl text-xs font-bold transition-colors"
              style={{
                backgroundColor: orderActive
                  ? 'rgba(239,68,68,0.2)'
                  : inputs.position === 'LONG' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
                color: orderActive ? '#ef4444' : inputs.position === 'LONG' ? '#22c55e' : '#ef4444',
                border: `1px solid ${orderActive ? 'rgba(239,68,68,0.4)' : inputs.position === 'LONG' ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
              }}
            >
              {orderActive ? 'X Cerrar Orden' : `> Ejecutar Orden ${inputs.position}`}
            </button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        <SummaryCard label="TP sin recompras" value={`$${fmt(result.tpNoRecompra, d)}`} sublabel={`$${fmt(result.tpNoRecompraUsd, 2)} ganancia`} color="#22c55e" />
        <SummaryCard label="Stop Loss" value={`$${fmt(result.lastSl, d)}`} sublabel={`${fmt(result.lastSlPct * 100, 2)}%`} color="#ef4444" />
        <SummaryCard label="Liquidacion" value={`$${fmt(result.liqPrice, d)}`} sublabel={`${fmt(result.liqPct * 100, 2)}%`} color="#f59e0b" />
        <SummaryCard label="Comision entrada" value={`$${fmt(result.initCom, 4)}`} sublabel={inputs.orderType} color="#9ca3af" />
      </div>

      {/* Recompra table */}
      <div className="rounded-2xl p-3" style={{ backgroundColor: '#1e2536' }}>
        <h3 className="text-xs font-bold text-white mb-2">Tabla de Recompras</h3>
        <div className="overflow-x-auto -mx-3 px-3">
          <table className="w-full text-[10px]" style={{ minWidth: 600 }}>
            <thead>
              <tr style={{ color: '#9ca3af' }}>
                <th className="text-left py-1 pr-2">#</th>
                <th className="text-right py-1 px-1">Precio Rec.</th>
                <th className="text-right py-1 px-1">Monedas</th>
                <th className="text-right py-1 px-1">PPE</th>
                <th className="text-right py-1 px-1">SL</th>
                <th className="text-right py-1 px-1">Total Mon.</th>
                <th className="text-right py-1 px-1">TP Precio</th>
                <th className="text-right py-1 px-1">TP $</th>
                <th className="text-right py-1 px-1">USDT</th>
                <th className="text-right py-1 px-1">Liq.</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map(row => (
                <tr key={row.num} className="border-t" style={{ borderColor: 'rgba(75,85,99,0.2)' }}>
                  <td className="py-1.5 pr-2 font-bold" style={{ color: '#f59e0b' }}>{row.num}</td>
                  <td className="text-right py-1.5 px-1" style={{ color: inputs.position === 'LONG' ? '#ef4444' : '#22c55e' }}>{fmt(row.recompraPrice, d)}</td>
                  <td className="text-right py-1.5 px-1 text-white">{fmt(row.coins, 2)}</td>
                  <td className="text-right py-1.5 px-1" style={{ color: '#f59e0b' }}>{fmt(row.avgEntry, d)}</td>
                  <td className="text-right py-1.5 px-1" style={{ color: '#ef4444' }}>{fmt(row.slPartial, d)}</td>
                  <td className="text-right py-1.5 px-1 text-white">{fmt(row.totalCoins, 2)}</td>
                  <td className="text-right py-1.5 px-1" style={{ color: '#22c55e' }}>{fmt(row.tpPrice, d)}</td>
                  <td className="text-right py-1.5 px-1" style={{ color: '#22c55e' }}>${fmt(row.tpUsd, 2)}</td>
                  <td className="text-right py-1.5 px-1 text-white">${fmt(row.usdtUsed, 2)}</td>
                  <td className="text-right py-1.5 px-1" style={{ color: '#f59e0b' }}>{fmt(row.liqPrice, d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Commissions detail */}
      <div className="rounded-2xl p-3" style={{ backgroundColor: '#1e2536' }}>
        <h3 className="text-xs font-bold text-white mb-2">Comisiones</h3>
        <div className="space-y-1">
          <ComRow label="Entrada + Recompras" value={`$${fmt(result.initCom + result.rows.reduce((s, r) => s + r.comEntry, 0), 4)}`} />
          <ComRow label="TP Orden Limite" value={`$${fmt(result.comTpLimit, 4)}`} />
          <ComRow label="TP Orden Market" value={`$${fmt(result.comTpMarket, 4)}`} />
        </div>
      </div>

      <div className="text-center text-[9px] py-2" style={{ color: '#4b5563' }}>
        Calculadora v2.0 - Formula Liquidacion Binance
      </div>
    </div>
  )
}

function InputField({ label, value, onChange, suffix }: { label: string; value: number; onChange: (v: number) => void; suffix?: string }) {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)
  const displayText = focused ? text : String(value)

  return (
    <div>
      <label className="text-[10px] font-medium mb-1 block" style={{ color: '#9ca3af' }}>{label}</label>
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          value={displayText}
          onFocus={e => {
            setFocused(true)
            setText(String(value))
            setTimeout(() => e.target.select(), 0)
          }}
          onChange={e => {
            const raw = e.target.value
            setText(raw)
            const v = parseFloat(raw)
            if (!isNaN(v)) onChange(v)
          }}
          onBlur={() => {
            setFocused(false)
          }}
          className="w-full px-2 py-1.5 rounded-lg text-xs text-white outline-none"
          style={{ backgroundColor: '#1a1f2e', border: '1px solid rgba(75,85,99,0.3)' }}
        />
        {suffix && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: '#6b7280' }}>{suffix}</span>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sublabel, color }: { label: string; value: string; sublabel: string; color: string }) {
  return (
    <div className="rounded-xl p-2.5" style={{ backgroundColor: `${color}10`, border: `1px solid ${color}30` }}>
      <div className="text-[10px] font-medium mb-0.5" style={{ color: '#9ca3af' }}>{label}</div>
      <div className="text-sm font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px]" style={{ color: '#6b7280' }}>{sublabel}</div>
    </div>
  )
}

function ComRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[11px]">
      <span style={{ color: '#9ca3af' }}>{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  )
}
