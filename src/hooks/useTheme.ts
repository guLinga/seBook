import { createContext, useContext } from 'react'

export type ThemeMode = 'light' | 'eye' | 'dark'

export const THEME_ORDER: ThemeMode[] = ['light', 'eye', 'dark']

export const THEME_LABELS: Record<ThemeMode, string> = {
  light: '浅色',
  eye: '护眼',
  dark: '深色',
}

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'eye' || value === 'dark'
}

export function getNextTheme(theme: ThemeMode): ThemeMode {
  const index = THEME_ORDER.indexOf(theme)
  return THEME_ORDER[(index + 1) % THEME_ORDER.length]
}

type ThemeContextValue = {
  theme: ThemeMode
  toggleTheme: () => void
  themeLabel: string
  nextThemeLabel: string
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => undefined,
  themeLabel: THEME_LABELS.light,
  nextThemeLabel: THEME_LABELS.eye,
})

export function useTheme() {
  return useContext(ThemeContext)
}
