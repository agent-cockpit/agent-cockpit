import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './router.js'
import { useSessionEvents } from './hooks/useSessionEvents.js'
import { useAudioBootstrap } from './audio/useAudioBootstrap.js'
import { useStore } from './store/index.js'
import './index.css'

function DaemonStatusBanner() {
  const wsStatus = useStore((s) => s.wsStatus)
  if (wsStatus === 'connected') return null
  const label = wsStatus === 'connecting' ? 'Connecting to daemon…' : 'Daemon disconnected — reconnecting'
  const color = wsStatus === 'connecting' ? 'var(--color-cockpit-amber)' : 'var(--color-cockpit-red)'
  return (
    <div
      data-testid="daemon-status-banner"
      role="status"
      className="fixed top-0 inset-x-0 z-[200] border-b px-3 py-1 text-center [font-family:var(--font-mono-data)] text-[10px] uppercase tracking-[0.18em]"
      style={{ color, borderColor: color, background: 'color-mix(in srgb, var(--color-background) 85%, transparent)' }}
    >
      {label}
    </div>
  )
}

function App() {
  useAudioBootstrap()
  useSessionEvents()
  return (
    <>
      <DaemonStatusBanner />
      <RouterProvider router={router} />
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
