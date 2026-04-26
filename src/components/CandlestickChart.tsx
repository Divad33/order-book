import { useRef, useEffect, useState, useCallback } from 'react'

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

interface CandlestickChartProps {
  klines: Kline[]
  symbol: string
  overlayLines?: OverlayLine[]
}

export function CandlestickChart({ klines, overlayLines }: CandlestickChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const [offset, setOffset] = useState(0)
  const [candleWidth, setCandleWidth] = useState(8)
  const touchRef = useRef<{ startX: number; startOffset: number; pinchDist?: number; startCW?: number } | null>(null)
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

  // Touch/mouse handlers for pan & pinch zoom
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchRef.current = { startX: e.touches[0].clientX, startOffset: offset }
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      touchRef.current = {
        startX: 0,
        startOffset: offset,
        pinchDist: Math.sqrt(dx * dx + dy * dy),
        startCW: candleWidth,
      }
    }
  }, [offset, candleWidth])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return
    if (e.touches.length === 1 && !touchRef.current.pinchDist) {
      const dx = e.touches[0].clientX - touchRef.current.startX
      const newOffset = Math.max(0, touchRef.current.startOffset - Math.round(dx / (candleWidth + 2)))
      setOffset(Math.min(newOffset, Math.max(0, klines.length - 10)))
    } else if (e.touches.length === 2 && touchRef.current.pinchDist) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const scale = dist / touchRef.current.pinchDist
      const newCW = Math.max(3, Math.min(20, Math.round((touchRef.current.startCW ?? 8) * scale)))
      setCandleWidth(newCW)
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

    // Find price range (include overlay lines)
    let minP = Infinity
    let maxP = -Infinity
    let maxVol = 0
    for (const k of visible) {
      if (k.low < minP) minP = k.low
      if (k.high > maxP) maxP = k.high
      if (k.volume > maxVol) maxVol = k.volume
    }
    if (overlayLines) {
      for (const line of overlayLines) {
        if (line.price > 0) {
          if (line.price < minP) minP = line.price
          if (line.price > maxP) maxP = line.price
        }
      }
    }
    const pRange = maxP - minP || 1
    const padding = pRange * 0.05
    minP -= padding
    maxP += padding
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

    // Volume bars at bottom (20% of chart height)
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
      if (isGreen) {
        ctx.fillStyle = '#22c55e'
      } else {
        ctx.fillStyle = '#ef4444'
      }
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

    // Overlay lines (5 order book levels)
    if (overlayLines && overlayLines.length > 0) {
      for (const line of overlayLines) {
        if (line.price < minP || line.price > maxP) continue
        const y = priceToY(line.price)

        // Dashed line across chart
        ctx.strokeStyle = line.color
        ctx.lineWidth = 1
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(chartW, y)
        ctx.stroke()
        ctx.setLineDash([])

        // Price tag on right axis
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
        ctx.fillStyle = line.color === '#ffffff' ? '#000' : '#000'
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
  }, [klines, dims, offset, candleWidth, crosshair, overlayLines])

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
    </div>
  )
}
