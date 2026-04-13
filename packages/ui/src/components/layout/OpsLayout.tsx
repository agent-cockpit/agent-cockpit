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
          <div className="rounded-xl border border-border/80 bg-background/20 px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="[font-family:var(--font-sidebar-display)] text-sm font-semibold tracking-wide text-foreground">
                  Agent Cockpit
                </h1>
                <p className="mt-1 truncate [font-family:var(--font-sidebar-body)] text-xs text-muted-foreground">
                  {activeSessionCount} active session{activeSessionCount === 1 ? '' : 's'}
                </p>
              </div>
              <button
                onClick={() => setHistoryOpen(true)}
                className="[font-family:var(--font-sidebar-body)] rounded-md border border-border/80 px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
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
            className="absolute inset-y-0 right-0 w-2 cursor-col-resize border-l border-transparent transition-colors hover:border-cyan-300/60"
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
