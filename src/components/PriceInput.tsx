import { useState, useCallback } from 'react'

interface PriceInputProps {
  value: number
  onChange: (value: number) => void
  onRemove: () => void
  variant: 'short' | 'long'
  index: number
}

export function PriceInput({
  value,
  onChange,
  onRemove,
  variant,
  index,
}: PriceInputProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const bgClass =
    variant === 'short'
      ? 'bg-red-600 border-red-500'
      : index === 0
        ? 'bg-green-600 border-green-500'
        : 'bg-green-500 border-green-400'

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
        className={`w-full text-center font-bold text-white rounded px-2 py-1.5 text-sm ${bgClass} border active:opacity-80`}
      >
        {value.toLocaleString()}
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
