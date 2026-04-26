import { Outlet } from 'react-router'
import { useState } from 'react'
import { MapSidebar } from './MapSidebar.js'
import { HistoryPopup } from '../office/HistoryPopup.js'
import { StatsPopup } from '../office/StatsPopup.js'
import { scrollToSession } from '../../pages/OfficePage.js'
import { useActiveSessions } from '../../store/selectors.js'

export function OpsLayout() {
  const activeSessions = useActiveSessions()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const activeSessionCount = activeSessions.length

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header
        data-testid="ops-topbar"
        className="flex flex-none items-stretch border-b border-border bg-sidebar"
        style={{ height: '56px' }}
      >
        {/* Branding */}
        <div className="flex flex-none items-center px-3">
          <div className="cockpit-frame-full rounded-none border border-border/80 bg-[var(--color-panel-surface)] px-3 py-1.5">
            <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
            <span className="cockpit-corner cockpit-corner-tr" aria-hidden />
            <span className="cockpit-corner cockpit-corner-bl" aria-hidden />
            <span className="cockpit-corner cockpit-corner-br" aria-hidden />
            <div className="flex items-center gap-3">
              <div className="min-w-0">
                <p className="cockpit-label mb-0">Mission Control</p>
                <h1
                  className="[font-family:var(--font-sidebar-display)] text-[10px] font-semibold tracking-widest text-foreground uppercase leading-none"
                  style={{ textShadow: '0 0 8px oklch(0.75 0.18 195 / 0.6)' }}
                >
                  Agent Cockpit
                </h1>
              </div>
              <p className="data-readout text-[10px] shrink-0">
                <span className="data-readout-dim">ACTIVE:&nbsp;</span>
                <span
                  className="tabular-nums"
                  style={{ color: activeSessionCount > 0 ? 'var(--color-cockpit-green)' : 'var(--color-cockpit-dim)' }}
                >
                  {String(activeSessionCount).padStart(2, '0')}
                </span>
              </p>
              <button
                onClick={() => setHistoryOpen(true)}
                className="cockpit-btn shrink-0"
              >
                History
              </button>
              <button
                onClick={() => setStatsOpen(true)}
                className="cockpit-btn shrink-0"
              >
                Stats
              </button>
            </div>
          </div>
        </div>

        {/* Sessions */}
        <div className="min-w-0 flex-1 [font-family:var(--font-sidebar-body)]">
          <MapSidebar onFocusSession={scrollToSession} />
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <Outlet />
        <HistoryPopup open={historyOpen} onClose={() => setHistoryOpen(false)} />
        <StatsPopup open={statsOpen} onClose={() => setStatsOpen(false)} />
      </main>
    </div>
  )
}
