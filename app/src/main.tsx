import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './global.css'
import App from './App'

// Apply the saved theme before the first paint (dark is the default).
if (localStorage.getItem('stlinux-theme') === 'light') {
  document.documentElement.classList.remove('dark')
}

if (import.meta.env.DEV && location.search.includes('mock')) {
  await import('./dev-mock')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
