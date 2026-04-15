import { Outlet } from 'react-router'
import { type PointerEvent as ReactPointerEvent, useEffect, useState } from 'react'
import { MapSidebar } from './MapSidebar.js'
import { HistoryPopup } from '../office/HistoryPopup.js'
import { scrollToSession } from '../../pages/OfficePage.js'
import { useLocalStorage } from '../../hooks/useLocalStorage.js'
import { useActiveSessions } from '../../store/selectors.js'

const SIDEBAR_STORAGE_KEY = 'cockpit.sidebar.width'
const SIDEBAR_DEFAULT_WIDTH = 320
const SIDEBAR_MIN_WIDTH = 260
const SIDEBAR_MAX_WIDTH = 460
const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)'

function clampSidebarWidth(width: number) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width))
}

function getPointerClientX(event: { clientX?: number; pageX?: number; screenX?: number }) {
  if (typeof event.clientX === 'number' && Number.isFinite(event.clientX)) {
    return event.clientX
  }
  if (typeof event.pageX === 'number' && Number.isFinite(event.pageX)) {
    return event.pageX
  }
  if (typeof event.screenX === 'number' && Number.isFinite(event.screenX)) {
    return event.screenX
  }
  return null
}

export function OpsLayout() {
  const activeSessions = useActiveSessions()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [storedSidebarWidth, setStoredSidebarWidth] = useLocalStorage<number>(
    SIDEBAR_STORAGE_KEY,
    SIDEBAR_DEFAULT_WIDTH,
  )
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') {
      return true
    }
    return window.matchMedia(DESKTOP_MEDIA_QUERY).matches
  })
  const sidebarWidth = clampSidebarWidth(storedSidebarWidth)
  const activeSessionCount = activeSessions.length

  useEffect(() => {
    if (storedSidebarWidth !== sidebarWidth) {
      setStoredSidebarWidth(sidebarWidth)
    }
  }, [setStoredSidebarWidth, sidebarWidth, storedSidebarWidth])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY)
    setIsDesktop(mediaQuery.matches)

    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches)
    mediaQuery.addEventListener('change', onChange)
    return () => mediaQuery.removeEventListener('change', onChange)
  }, [])

  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDesktop) {
      return
    }

    event.preventDefault()

    const startX = getPointerClientX(event)
    if (startX === null) {
      return
    }
    const startWidth = sidebarWidth

    const handlePointerMove = (moveEvent: PointerEvent | MouseEvent) => {
      const moveX = getPointerClientX(moveEvent)
      if (moveX === null) {
        return
      }

      const nextWidth = clampSidebarWidth(startWidth + (moveX - startX))
      setStoredSidebarWidth(nextWidth)
    }

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside
        data-testid="ops-sidebar"
        style={{ width: sidebarWidth }}
        className="relative flex flex-none flex-col overflow-hidden border-r border-border bg-sidebar"
      >
        <div className="border-b border-border px-3 py-3">
          <div className="cockpit-frame-full rounded-none border border-border/80 bg-[var(--color-panel-surface)] px-3 py-2.5">
            <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
            <span className="cockpit-corner cockpit-corner-tr" aria-hidden />
            <span className="cockpit-corner cockpit-corner-bl" aria-hidden />
            <span className="cockpit-corner cockpit-corner-br" aria-hidden />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="cockpit-label mb-0.5">Mission Control</p>
                <h1
                  className="[font-family:var(--font-sidebar-display)] text-[10px] font-semibold tracking-widest text-foreground uppercase"
                  style={{ textShadow: '0 0 8px oklch(0.75 0.18 195 / 0.6)' }}
                >
                  Agent Cockpit
                </h1>
                <p className="mt-1 data-readout text-[10px]">
                  <span className="data-readout-dim">ACTIVE:&nbsp;</span>
                  <span
                    className="tabular-nums"
                    style={{ color: activeSessionCount > 0 ? 'var(--color-cockpit-green)' : 'var(--color-cockpit-dim)' }}
                  >
                    {String(activeSessionCount).padStart(2, '0')}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setHistoryOpen(true)}
                className="cockpit-btn shrink-0"
              >
                History
              </button>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 [font-family:var(--font-sidebar-body)]">
          <MapSidebar onFocusSession={scrollToSession} />
        </div>
        {isDesktop && (
          <div
            role="separator"
            aria-label="Resize sidebar"
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={handleResizeStart}
            className="absolute inset-y-0 right-0 w-2 cursor-col-resize border-l border-transparent transition-all hover:border-[var(--color-cockpit-cyan)]/60 hover:shadow-[-2px_0_6px_oklch(0.75_0.18_195_/_0.4)]"
          />
        )}
      </aside>
      <main className="flex-1 overflow-hidden">
        <Outlet />
        <HistoryPopup open={historyOpen} onClose={() => setHistoryOpen(false)} />
      </main>
    </div>
  )
}
