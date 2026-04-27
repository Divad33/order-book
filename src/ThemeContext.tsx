import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'

export type ThemeMode = 'dark' | 'light'

interface ThemeColors {
  bg: string
  surface: string
  card: string
  cardBorder: string
  text: string
  textSecondary: string
  textMuted: string
  navBg: string
  navBorder: string
  inputBg: string
  inputBorder: string
}

const themes: Record<ThemeMode, ThemeColors> = {
  dark: {
    bg: '#141821',
    surface: '#1a1f2e',
    card: '#1e2536',
    cardBorder: 'transparent',
    text: '#ffffff',
    textSecondary: '#9ca3af',
    textMuted: '#6b7280',
    navBg: '#1a1f2e',
    navBorder: '#1f2937',
    inputBg: '#1f2937',
    inputBorder: '#374151',
  },
  light: {
    bg: '#f0f2f5',
    surface: '#ffffff',
    card: '#ffffff',
    cardBorder: '#e5e7eb',
    text: '#111827',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    navBg: '#ffffff',
    navBorder: '#e5e7eb',
    inputBg: '#f3f4f6',
    inputBorder: '#d1d5db',
  },
}

interface ThemeContextValue {
  mode: ThemeMode
  colors: ThemeColors
  toggle: () => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  colors: themes.dark,
  toggle: () => {},
  isDark: true,
})

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem('ob_theme') as ThemeMode) || 'dark'
  })

  useEffect(() => {
    localStorage.setItem('ob_theme', mode)
  }, [mode])

  const toggle = () => setMode((m) => (m === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ mode, colors: themes[mode], toggle, isDark: mode === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  )
}
