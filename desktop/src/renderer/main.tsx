import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './i18n'
import './styles/index.css'

// shadcn themes switch on a `dark` class. The app has no theme switcher, so the
// class simply tracks the OS setting for the lifetime of the window.
const media = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = (matches: boolean): void => {
  document.documentElement.classList.toggle('dark', matches)
}
applyTheme(media.matches)
media.addEventListener('change', (event) => applyTheme(event.matches))

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
