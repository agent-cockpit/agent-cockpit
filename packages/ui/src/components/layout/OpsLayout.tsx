import { Outlet } from 'react-router'
import { useState } from 'react'
import { MapSidebar } from './MapSidebar.js'
import { HistoryPopup } from '../office/HistoryPopup.js'
import { StatsPopup } from '../office/StatsPopup.js'
import { SharedContextPopup } from '../office/SharedContextPopup.js'
import { scrollToSession } from '../../pages/OfficePage.js'
import { useActiveSessions } from '../../store/selectors.js'
import { useStore } from '../../store/index.js'

export function OpsLayout() {
  const activeSessions = useActiveSessions()
  const wsStatus = useStore((s) => s.wsStatus)
  const sharedContextCount = useStore((s) => Object.keys(s.sharedContext).length)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const activeSessionCount = activeSessions.length

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header
        data-testid="ops-topbar"
        className="flex flex-none items-stretch border-b border-border bg-sidebar"
        style={{ height: '56px' }}
      >
        {/* Branding */}
        <div className="flex flex-none items-center gap-3 px-4 border-r border-border/50 shrink-0">
          <div className="min-w-0">
            <p className="cockpit-label mb-0">Mission Control</p>
            <h1
              className="[font-family:var(--font-sidebar-display)] text-[11px] font-semibold tracking-wider text-foreground uppercase leading-none"
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
          <button
            onClick={() => setContextOpen(true)}
            className="cockpit-btn shrink-0"
          >
            Context{sharedContextCount > 0 ? ` (${sharedContextCount})` : ''}
          </button>
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
        <SharedContextPopup open={contextOpen} onClose={() => setContextOpen(false)} />
      </main>
    </div>
  )
}
