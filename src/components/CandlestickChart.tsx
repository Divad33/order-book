import { useRef, useEffect, useState, useCallback } from 'react'
import type { CalcResult } from './Calculator'

export interface Kline {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface OverlayLine {
  price: number
  color: string
  label: string
}

export interface ActiveOrder {
  calc: CalcResult
  currentPrice: number
}

interface CandlestickChartProps {
  klines: Kline[]
  symbol: string
  overlayLines?: OverlayLine[]
  activeOrder?: ActiveOrder | null
}

export function CandlestickChart({ klines, overlayLines, activeOrder }: CandlestickChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const [offset, setOffset] = useState(0)
  const [candleWidth, setCandleWidth] = useState(8)
  const [yScale, setYScale] = useState(1)
  const [yOffset, setYOffset] = useState(0)
  const touchRef = useRef<{
    startX: number; startY: number; startOffset: number;
    pinchDist?: number; startCW?: number;
    startYScale?: number; startYOffset?: number;
    isVertical?: boolean; isHorizontal?: boolean;
  } | null>(null)
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; kline: Kline } | null>(null)

  // Resize observer
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setDims({ w: Math.floor(width), h: Math.floor(height) })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Touch handlers for pan (X + Y) & pinch zoom
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startOffset: offset,
        startYOffset: yOffset,
        isVertical: false,
        isHorizontal: false,
      }
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      touchRef.current = {
        startX: 0,
        startY: 0,
        startOffset: offset,
        pinchDist: Math.sqrt(dx * dx + dy * dy),
        startCW: candleWidth,
        startYScale: yScale,
      }
    }
  }, [offset, candleWidth, yScale, yOffset])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return
    if (e.touches.length === 1 && !touchRef.current.pinchDist) {
      const dx = e.touches[0].clientX - touchRef.current.startX
      const dy = e.touches[0].clientY - touchRef.current.startY

      // Determine direction on first significant move
      if (!touchRef.current.isVertical && !touchRef.current.isHorizontal) {
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
          if (Math.abs(dy) > Math.abs(dx) * 1.2) {
            touchRef.current.isVertical = true
          } else {
            touchRef.current.isHorizontal = true
          }
        }
        return
      }

      if (touchRef.current.isHorizontal) {
        const newOffset = Math.max(0, touchRef.current.startOffset - Math.round(dx / (candleWidth + 2)))
        setOffset(Math.min(newOffset, Math.max(0, klines.length - 10)))
      } else if (touchRef.current.isVertical) {
        setYOffset((touchRef.current.startYOffset ?? 0) + dy * 0.5)
      }
    } else if (e.touches.length === 2 && touchRef.current.pinchDist) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const scale = dist / touchRef.current.pinchDist

      // Pinch mainly horizontal = X zoom, mainly vertical = Y zoom
      const adx = Math.abs(e.touches[0].clientX - e.touches[1].clientX)
      const ady = Math.abs(e.touches[0].clientY - e.touches[1].clientY)
      if (adx > ady) {
        const newCW = Math.max(3, Math.min(20, Math.round((touchRef.current.startCW ?? 8) * scale)))
        setCandleWidth(newCW)
      } else {
        const newYScale = Math.max(0.3, Math.min(5, (touchRef.current.startYScale ?? 1) * scale))
        setYScale(newYScale)
      }
    }
  }, [candleWidth, klines.length])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      touchRef.current = null
      setCrosshair(null)
    }
  }, [])

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || dims.w === 0 || klines.length === 0) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = dims.w * dpr
    canvas.height = dims.h * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    const w = dims.w
    const h = dims.h
    const gap = 2
    const totalCandleW = candleWidth + gap
    const rightPad = 85
    const topPad = 10
    const bottomPad = 28
    const chartW = w - rightPad
    const chartH = h - topPad - bottomPad

    const visibleCount = Math.floor(chartW / totalCandleW)
    const startIdx = Math.max(0, klines.length - visibleCount - offset)
    const endIdx = Math.min(klines.length, startIdx + visibleCount)
    const visible = klines.slice(startIdx, endIdx)

    if (visible.length === 0) return

    // Background
    ctx.fillStyle = '#0f1729'
    ctx.fillRect(0, 0, w, h)

    // Find price range from candles only
    let rawMinP = Infinity
    let rawMaxP = -Infinity
    let maxVol = 0
    for (const k of visible) {
      if (k.low < rawMinP) rawMinP = k.low
      if (k.high > rawMaxP) rawMaxP = k.high
      if (k.volume > maxVol) maxVol = k.volume
    }
    const rawRange = rawMaxP - rawMinP || 1
    const padding = rawRange * 0.08

    // Apply Y-axis zoom (yScale) and pan (yOffset)
    const midP = (rawMaxP + rawMinP) / 2
    const halfRange = (rawRange + padding * 2) / 2 / yScale
    const minP = midP - halfRange - yOffset * (rawRange / chartH)
    const maxP = midP + halfRange - yOffset * (rawRange / chartH)
    const totalRange = maxP - minP

    const priceToY = (p: number) => topPad + (1 - (p - minP) / totalRange) * chartH

    // Grid lines
    const gridLines = 6
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 1
    ctx.fillStyle = '#64748b'
    ctx.font = '9px monospace'
    ctx.textAlign = 'right'
    for (let i = 0; i <= gridLines; i++) {
      const p = minP + (totalRange * i) / gridLines
      const y = priceToY(p)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(chartW, y)
      ctx.stroke()
      const formatted = p >= 1 ? p.toLocaleString(undefined, { maximumFractionDigits: 0 }) : p.toPrecision(5)
      ctx.fillText(formatted, w - 4, y + 3)
    }

    // ── Active Order: Profit/Loss Zones (drawn BEFORE candles so candles are on top) ──
    if (activeOrder) {
      const { calc, currentPrice } = activeOrder
      const entry = calc.entryPrice
      const tp = calc.tpNoRecompra
      const sl = calc.lastSl
      const isLong = calc.position === 'LONG'

      const entryY = priceToY(entry)
      const tpY = priceToY(tp)
      const slY = priceToY(sl)

      // Clamp to chart area
      const clampY = (y: number) => Math.max(topPad, Math.min(topPad + chartH, y))

      // Profit zone (green semi-transparent)
      ctx.fillStyle = 'rgba(34,197,94,0.08)'
      const profitTop = clampY(Math.min(entryY, tpY))
      const profitBot = clampY(Math.max(entryY, tpY))
      ctx.fillRect(0, profitTop, chartW, profitBot - profitTop)

      // Loss zone (red semi-transparent)
      ctx.fillStyle = 'rgba(239,68,68,0.08)'
      const lossTop = clampY(Math.min(entryY, slY))
      const lossBot = clampY(Math.max(entryY, slY))
      ctx.fillRect(0, lossTop, chartW, lossBot - lossTop)

      // Entry line (white solid)
      if (entryY >= topPad && entryY <= topPad + chartH) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(0, entryY)
        ctx.lineTo(chartW, entryY)
        ctx.stroke()

        // Entry label
        const posLabel = isLong ? 'LONG' : 'SHORT'
        const entryStr = entry >= 1 ? entry.toLocaleString(undefined, { maximumFractionDigits: 2 }) : entry.toPrecision(5)
        ctx.fillStyle = isLong ? '#22c55e' : '#ef4444'
        ctx.fillRect(chartW, entryY - 8, rightPad, 16)
        ctx.fillStyle = '#000'
        ctx.font = 'bold 8px monospace'
        ctx.textAlign = 'right'
        ctx.fillText(`${posLabel} ${entryStr}`, w - 3, entryY + 4)
      }

      // TP line (green dashed)
      if (tpY >= topPad && tpY <= topPad + chartH) {
        ctx.strokeStyle = '#22c55e'
        ctx.lineWidth = 1.5
        ctx.setLineDash([8, 4])
        ctx.beginPath()
        ctx.moveTo(0, tpY)
        ctx.lineTo(chartW, tpY)
        ctx.stroke()
        ctx.setLineDash([])

        // TP label with profit info
        const tpStr = tp >= 1 ? tp.toLocaleString(undefined, { maximumFractionDigits: 2 }) : tp.toPrecision(5)
        const tpUsd = calc.numCoins * entry * (calc.takeProfitPct / 100)
        ctx.fillStyle = '#22c55e'
        ctx.fillRect(chartW, tpY - 8, rightPad, 16)
        ctx.fillStyle = '#000'
        ctx.font = 'bold 8px monospace'
        ctx.textAlign = 'right'
        ctx.fillText(`TP $${tpStr}`, w - 3, tpY + 4)

        // Profit amount text in the zone
        const profitMid = (entryY + tpY) / 2
        if (profitMid >= topPad && profitMid <= topPad + chartH) {
          ctx.fillStyle = 'rgba(34,197,94,0.9)'
          ctx.font = 'bold 10px monospace'
          ctx.textAlign = 'center'
          ctx.fillText(`+$${tpUsd.toFixed(2)} (+${calc.takeProfitPct}%)`, chartW / 2, profitMid)
        }
      }

      // SL line (red dashed)
      if (slY >= topPad && slY <= topPad + chartH) {
        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth = 1.5
        ctx.setLineDash([8, 4])
        ctx.beginPath()
        ctx.moveTo(0, slY)
        ctx.lineTo(chartW, slY)
        ctx.stroke()
        ctx.setLineDash([])

        // SL label
        const slStr = sl >= 1 ? sl.toLocaleString(undefined, { maximumFractionDigits: 2 }) : sl.toPrecision(5)
        ctx.fillStyle = '#ef4444'
        ctx.fillRect(chartW, slY - 8, rightPad, 16)
        ctx.fillStyle = '#000'
        ctx.font = 'bold 8px monospace'
        ctx.textAlign = 'right'
        ctx.fillText(`SL $${slStr}`, w - 3, slY + 4)

        // Loss amount text in the zone
        const lossMid = (entryY + slY) / 2
        if (lossMid >= topPad && lossMid <= topPad + chartH) {
          ctx.fillStyle = 'rgba(239,68,68,0.9)'
          ctx.font = 'bold 10px monospace'
          ctx.textAlign = 'center'
          ctx.fillText(`-$${calc.stopLossUsd.toFixed(2)}`, chartW / 2, lossMid)
        }
      }

      // Recompra lines (violet dotted, subtle)
      for (let i = 0; i < calc.rows.length; i++) {
        const rp = calc.rows[i].recompraPrice
        if (rp <= 0) continue
        const rpY = priceToY(rp)
        if (rpY < topPad || rpY > topPad + chartH) continue

        ctx.strokeStyle = 'rgba(167,139,250,0.5)'
        ctx.lineWidth = 0.8
        ctx.setLineDash([3, 5])
        ctx.beginPath()
        ctx.moveTo(0, rpY)
        ctx.lineTo(chartW, rpY)
        ctx.stroke()
        ctx.setLineDash([])

        // Small label
        ctx.fillStyle = 'rgba(167,139,250,0.7)'
        ctx.font = '7px monospace'
        ctx.textAlign = 'left'
        ctx.fillText(`R${i + 1}`, 3, rpY - 2)
      }

      // Liquidation line (orange)
      if (calc.liqPrice > 0) {
        const liqY = priceToY(calc.liqPrice)
        if (liqY >= topPad && liqY <= topPad + chartH) {
          ctx.strokeStyle = '#f97316'
          ctx.lineWidth = 1
          ctx.setLineDash([4, 6])
          ctx.beginPath()
          ctx.moveTo(0, liqY)
          ctx.lineTo(chartW, liqY)
          ctx.stroke()
          ctx.setLineDash([])

          const liqStr = calc.liqPrice >= 1 ? calc.liqPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : calc.liqPrice.toPrecision(5)
          ctx.fillStyle = '#f97316'
          ctx.fillRect(chartW, liqY - 7, rightPad, 14)
          ctx.fillStyle = '#000'
          ctx.font = 'bold 7px monospace'
          ctx.textAlign = 'right'
          ctx.fillText(`LIQ $${liqStr}`, w - 3, liqY + 3)
        }
      }

      // R:R ratio badge
      const slDist = Math.abs(entry - sl)
      const tpDist = Math.abs(tp - entry)
      if (slDist > 0) {
        const rr = (tpDist / slDist).toFixed(1)
        ctx.fillStyle = 'rgba(30,37,54,0.9)'
        ctx.fillRect(4, topPad + 4, 56, 16)
        ctx.strokeStyle = 'rgba(100,116,139,0.4)'
        ctx.lineWidth = 1
        ctx.strokeRect(4, topPad + 4, 56, 16)
        ctx.fillStyle = '#fbbf24'
        ctx.font = 'bold 9px monospace'
        ctx.textAlign = 'left'
        ctx.fillText(`R:R 1:${rr}`, 8, topPad + 15)
      }

      // P&L indicator (current price vs entry)
      if (currentPrice > 0) {
        const pnlPct = isLong
          ? ((currentPrice - entry) / entry) * 100
          : ((entry - currentPrice) / entry) * 100
        const pnlUsd = calc.numCoins * Math.abs(currentPrice - entry) * (pnlPct >= 0 ? 1 : -1)
        const pnlColor = pnlPct >= 0 ? '#22c55e' : '#ef4444'
        const pnlSign = pnlPct >= 0 ? '+' : ''

        // P&L box at top-right of chart
        const boxW = 90
        const boxH = 28
        const boxX = chartW - boxW - 4
        const boxY = topPad + 4
        ctx.fillStyle = 'rgba(30,37,54,0.92)'
        ctx.fillRect(boxX, boxY, boxW, boxH)
        ctx.strokeStyle = pnlColor
        ctx.lineWidth = 1
        ctx.strokeRect(boxX, boxY, boxW, boxH)
        ctx.fillStyle = pnlColor
        ctx.font = 'bold 10px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(`${pnlSign}$${pnlUsd.toFixed(2)}`, boxX + boxW / 2, boxY + 11)
        ctx.font = '8px monospace'
        ctx.fillText(`${pnlSign}${pnlPct.toFixed(2)}%`, boxX + boxW / 2, boxY + 23)

        // Current price line (white dotted thin)
        const cpY = priceToY(currentPrice)
        if (cpY >= topPad && cpY <= topPad + chartH) {
          ctx.strokeStyle = 'rgba(255,255,255,0.4)'
          ctx.lineWidth = 0.8
          ctx.setLineDash([2, 4])
          ctx.beginPath()
          ctx.moveTo(0, cpY)
          ctx.lineTo(chartW, cpY)
          ctx.stroke()
          ctx.setLineDash([])
        }
      }
    }

    // Volume bars at bottom (18% of chart height)
    const volH = chartH * 0.18
    const volBase = topPad + chartH
    for (let i = 0; i < visible.length; i++) {
      const k = visible[i]
      const x = i * totalCandleW + gap
      const barH = maxVol > 0 ? (k.volume / maxVol) * volH : 0
      const isGreen = k.close >= k.open
      ctx.fillStyle = isGreen ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'
      ctx.fillRect(x, volBase - barH, candleWidth, barH)
    }

    // Candles
    for (let i = 0; i < visible.length; i++) {
      const k = visible[i]
      const x = i * totalCandleW + gap
      const cx = x + candleWidth / 2
      const isGreen = k.close >= k.open

      const bodyTop = priceToY(Math.max(k.open, k.close))
      const bodyBot = priceToY(Math.min(k.open, k.close))
      const bodyH = Math.max(1, bodyBot - bodyTop)
      const wickTop = priceToY(k.high)
      const wickBot = priceToY(k.low)

      // Wick
      ctx.strokeStyle = isGreen ? '#22c55e' : '#ef4444'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx, wickTop)
      ctx.lineTo(cx, wickBot)
      ctx.stroke()

      // Body
      ctx.fillStyle = isGreen ? '#22c55e' : '#ef4444'
      ctx.fillRect(x, bodyTop, candleWidth, bodyH)

      // 3D highlight on left edge
      if (candleWidth >= 5) {
        ctx.fillStyle = isGreen ? 'rgba(74,222,128,0.4)' : 'rgba(252,129,129,0.4)'
        ctx.fillRect(x, bodyTop, Math.max(1, candleWidth * 0.25), bodyH)
      }
    }

    // Time labels at bottom
    ctx.fillStyle = '#64748b'
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    const labelEvery = Math.max(1, Math.floor(visible.length / 6))
    for (let i = 0; i < visible.length; i += labelEvery) {
      const k = visible[i]
      const x = i * totalCandleW + gap + candleWidth / 2
      const dt = new Date(k.time)
      const label = `${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}`
      ctx.fillText(label, x, h - 4)
    }

    // Overlay lines (order book levels - drawn on top of candles)
    if (overlayLines && overlayLines.length > 0) {
      for (const line of overlayLines) {
        if (line.price < minP || line.price > maxP) continue
        const y = priceToY(line.price)

        ctx.strokeStyle = line.color
        ctx.lineWidth = 1
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(chartW, y)
        ctx.stroke()
        ctx.setLineDash([])

        const priceStr = line.price >= 1
          ? line.price.toLocaleString(undefined, { maximumFractionDigits: 0 })
          : line.price.toPrecision(5)
        const tagText = `${line.label} ${priceStr}`
        ctx.font = 'bold 8px monospace'
        const tagH = 14
        ctx.fillStyle = line.color
        ctx.globalAlpha = 0.9
        ctx.fillRect(chartW, y - tagH / 2, rightPad, tagH)
        ctx.globalAlpha = 1
        ctx.fillStyle = '#000'
        ctx.textAlign = 'right'
        ctx.fillText(tagText, w - 3, y + 3)
      }
    }

    // Crosshair
    if (crosshair) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(crosshair.x, topPad)
      ctx.lineTo(crosshair.x, topPad + chartH)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, crosshair.y)
      ctx.lineTo(chartW, crosshair.y)
      ctx.stroke()
      ctx.setLineDash([])

      // Info tooltip
      const k = crosshair.kline
      const info = `O:${k.open.toLocaleString()} H:${k.high.toLocaleString()} L:${k.low.toLocaleString()} C:${k.close.toLocaleString()}`
      ctx.fillStyle = 'rgba(30,41,59,0.9)'
      ctx.fillRect(4, 2, Math.min(chartW - 8, ctx.measureText(info).width + 12), 16)
      ctx.fillStyle = '#e2e8f0'
      ctx.font = '9px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(info, 10, 13)
    }
  }, [klines, dims, offset, candleWidth, crosshair, overlayLines, activeOrder, yScale, yOffset])

  const handleCanvasTouch = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1 || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.touches[0].clientX - rect.left
    const gap = 2
    const totalCandleW = candleWidth + gap
    const rightPad = 85
    const chartW = dims.w - rightPad
    const visibleCount = Math.floor(chartW / totalCandleW)
    const startIdx = Math.max(0, klines.length - visibleCount - offset)
    const idx = startIdx + Math.floor(x / totalCandleW)
    if (idx >= 0 && idx < klines.length) {
      setCrosshair({ x, y: e.touches[0].clientY - rect.top, kline: klines[idx] })
    }
  }, [candleWidth, dims.w, klines, offset])

  return (
    <div
      ref={containerRef}
      className="w-full flex-1 relative touch-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ width: dims.w, height: dims.h }}
        onTouchStart={handleCanvasTouch}
      />
      {/* Y-axis reset button */}
      {(yScale !== 1 || yOffset !== 0) && (
        <button
          onClick={() => { setYScale(1); setYOffset(0) }}
          className="absolute top-1 right-1 text-[8px] px-1.5 py-0.5 rounded bg-gray-700/70 text-gray-300 active:bg-gray-600"
        >
          Reset Y
        </button>
      )}
    </div>
  )
}
