import { useState, useCallback, useEffect, useRef } from 'react'

interface PriceInputProps {
  value: number
  volume: number
  prevPrice?: number
  onChange: (value: number) => void
  onRemove: () => void
  variant: 'short' | 'long'
  index: number
}

export function PriceInput({
  value,
  volume,
  prevPrice,
  onChange,
  onRemove,
  variant,
  index,
}: PriceInputProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const prevRef = useRef(value)

  useEffect(() => {
    if (prevPrice !== undefined && prevRef.current !== value) {
      if (value > prevRef.current) setFlash('up')
      else if (value < prevRef.current) setFlash('down')
      prevRef.current = value

      const t = setTimeout(() => setFlash(null), 800)
      return () => clearTimeout(t)
    }
    prevRef.current = value
  }, [value, prevPrice])

  const bgClass =
    variant === 'short'
      ? 'bg-red-600 border-red-500'
      : index === 0
        ? 'bg-green-600 border-green-500'
        : 'bg-green-500 border-green-400'

  const flashClass =
    flash === 'up'
      ? 'ring-2 ring-green-300 brightness-125'
      : flash === 'down'
        ? 'ring-2 ring-red-300 brightness-125'
        : ''

  const barColor = variant === 'short' ? 'bg-red-400/30' : 'bg-green-400/30'

  const startEdit = useCallback(() => {
    setDraft(value.toString())
    setEditing(true)
  }, [value])

  const commitEdit = useCallback(() => {
    const parsed = parseFloat(draft)
    if (!isNaN(parsed)) {
      onChange(parsed)
    }
    setEditing(false)
  }, [draft, onChange])

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
          autoFocus
          className={`w-full text-center font-bold text-white rounded px-2 py-1.5 text-sm ${bgClass} border outline-none`}
        />
        <button
          onClick={onRemove}
          className="text-red-300 hover:text-red-100 text-xs px-1"
          aria-label="Eliminar"
        >
          x
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={startEdit}
        className={`relative w-full text-center font-bold text-white rounded px-2 py-1.5 text-sm ${bgClass} border active:opacity-80 overflow-hidden transition-all duration-300 ${flashClass}`}
      >
        {/* Volume bar */}
        {volume > 0 && (
          <div
            className={`absolute inset-y-0 ${variant === 'short' ? 'right-0' : 'left-0'} ${barColor} transition-all duration-500`}
            style={{ width: `${volume * 100}%` }}
          />
        )}
        <span className="relative z-10">{value.toLocaleString()}</span>
      </button>
      <button
        onClick={onRemove}
        className="text-gray-500 hover:text-red-400 text-xs px-1 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Eliminar"
      >
        x
      </button>
    </div>
  )
}
