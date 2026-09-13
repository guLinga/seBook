import { useEffect, useMemo, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { ThemeContext, type ThemeMode } from './hooks/useTheme'
import PageHome from './pages/PageHome'
import PageReader from './pages/PageReader'
import './styles/global.less'

const THEME_KEY = 'seread-theme'

function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(THEME_KEY)
    return saved === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const value = useMemo(
    () => ({
      theme,
      toggleTheme: () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light')),
    }),
    [theme],
  )

  return (
    <ThemeContext.Provider value={value}>
      <div className="app-shell">
        <header className="app-header">
          <Link to="/" className="brand">
            seRead
          </Link>
        </header>
        <Routes>
          <Route path="/" element={<PageHome />} />
          <Route path="/read/:id" element={<PageReader />} />
        </Routes>
      </div>
    </ThemeContext.Provider>
  )
}

export default App
