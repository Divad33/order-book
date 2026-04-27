import { IconOrderBook, IconChart, IconHistory, IconSettings } from './Icons'
import { useTheme } from '../ThemeContext'

export type TabId = 'orderbook' | 'chart' | 'history' | 'settings'

interface BottomNavProps {
  active: TabId
  onChange: (tab: TabId) => void
}

const tabs: { id: TabId; label: string; icon: typeof IconOrderBook }[] = [
  { id: 'orderbook', label: 'Orden', icon: IconOrderBook },
  { id: 'chart', label: 'Gráfico', icon: IconChart },
  { id: 'history', label: 'Historial', icon: IconHistory },
  { id: 'settings', label: 'Ajustes', icon: IconSettings },
]

export function BottomNav({ active, onChange }: BottomNavProps) {
  const { colors } = useTheme()

  return (
    <nav
      className="flex items-stretch safe-bottom"
      style={{ backgroundColor: colors.navBg, borderTop: `1px solid ${colors.navBorder}` }}
    >
      {tabs.map(({ id, label, icon: Icon }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors"
            style={{ color: isActive ? '#fbbf24' : colors.textMuted }}
          >
            <Icon size={20} className={isActive ? 'text-yellow-400' : ''} />
            <span className="text-[10px] font-medium">{label}</span>
            {isActive && (
              <div className="w-5 h-0.5 rounded-full bg-yellow-400 mt-0.5" />
            )}
          </button>
        )
      })}
    </nav>
  )
}
