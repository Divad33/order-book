interface BlockCardProps {
  label: string
  value: number
  variant: 'short' | 'long' | 'entry' | 'neutral'
}

const variantStyles = {
  short: 'bg-red-900/60 border-red-700 text-red-200',
  long: 'bg-green-900/60 border-green-700 text-green-200',
  entry: 'bg-yellow-900/60 border-yellow-600 text-yellow-200',
  neutral: 'bg-gray-800 border-gray-600 text-gray-200',
}

const valueStyles = {
  short: 'text-red-400',
  long: 'text-green-400',
  entry: 'text-yellow-300',
  neutral: 'text-white',
}

export function BlockCard({ label, value, variant }: BlockCardProps) {
  return (
    <div
      className={`rounded-lg border p-3 ${variantStyles[variant]}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={`text-lg font-bold tabular-nums ${valueStyles[variant]}`}>
        {value.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </div>
    </div>
  )
}
