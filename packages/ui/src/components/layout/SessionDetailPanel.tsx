import { useEffect } from 'react'
import { NavLink, Outlet, useParams } from 'react-router'
import { getSessionTitle } from '../../lib/sessionTitle.js'
import type { PanelId } from '../../store/index.js'
import { useStore } from '../../store/index.js'
import { getProviderAccentStyle } from '../providerAccent.js'

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const TABS: { id: PanelId; label: string }[] = [
  { id: 'approvals', label: 'Approvals' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'diff', label: 'Diff' },
  { id: 'memory', label: 'Memory' },
  { id: 'artifacts', label: 'Artifacts' },
]

const STATUS_DOT: Record<string, string> = {
  active: 'status-ping status-ping-active h-2 w-2',
  ended:  'status-ping status-ping-ended h-2 w-2',
  error:  'status-ping status-ping-error h-2 w-2',
}

const PROVIDER_BADGE: Record<string, string> = {
  claude: 'badge-provider-claude',
  codex:  'badge-provider-codex',
}

export function SessionDetailPanel() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const session = useStore((s) => (sessionId ? s.sessions[sessionId] : undefined))

  // Sync active panel with the URL so the store stays in sync (OPS-03)
  useEffect(() => {
    if (!sessionId) return
    // Derive current panel from pathname
    const pathParts = window.location.pathname.split('/')
    const panelFromUrl = pathParts[pathParts.length - 1] as PanelId
    const validPanels: PanelId[] = ['approvals', 'timeline', 'diff', 'memory', 'artifacts']
    if (validPanels.includes(panelFromUrl)) {
      useStore.getState().setActivePanel(panelFromUrl)
    }
  }, [sessionId])

  if (!session) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <span className="text-sm text-muted-foreground">No session selected</span>
      </div>
    )
  }

  const projectName = getSessionTitle(session.workspacePath, session.sessionId)

  return (
    <div className="flex flex-col h-full" style={getProviderAccentStyle(session.provider)}>
      {/* Header */}
      <div className="cockpit-frame-full flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 bg-[var(--color-panel-surface)]">
        <span className="cockpit-corner cockpit-corner-bl" aria-hidden />
        <span className="cockpit-corner cockpit-corner-br" aria-hidden />
        <span
          className={`px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${PROVIDER_BADGE[session.provider] ?? 'badge-provider-claude'}`}
        >
          {session.provider}
        </span>
        <span className="[font-family:var(--font-mono-data)] text-xs font-semibold truncate uppercase tracking-wide">
          {projectName}
        </span>
        <span
          className={`shrink-0 ${STATUS_DOT[session.status] ?? 'status-ping status-ping-ended'}`}
          title={session.status}
        />
        {session.pendingApprovals > 0 && (
          <span
            className="border border-amber-300/50 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200 [font-family:var(--font-mono-data)]"
            style={{ textShadow: '0 0 3px rgba(251,191,36,0.5)' }}
          >
            {session.pendingApprovals} PENDING
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          {session.totalTokens !== undefined && session.totalTokens > 0 && (
            <span className="data-readout text-[10px] tabular-nums">
              <span className="data-readout-dim">IN:&nbsp;</span>
              <span>{fmtTokens(session.totalInputTokens ?? 0)}</span>
              <span className="data-readout-dim">&nbsp;/&nbsp;OUT:&nbsp;</span>
              <span>{fmtTokens(session.totalOutputTokens ?? 0)}</span>
              {session.contextPercent !== undefined && (
                <span className="data-readout-dim">&nbsp;({session.contextPercent.toFixed(0)}%&nbsp;ctx)</span>
              )}
            </span>
          )}
          <span className="data-readout text-[10px] tabular-nums">
            {new Date(session.startedAt).toLocaleString()}
          </span>
        </span>
      </div>

      {/* Tab strip */}
      <div className="flex border-b border-border shrink-0 px-4">
        {TABS.map((tab) => (
          <NavLink
            key={tab.id}
            to={`/session/${sessionId}/${tab.id}`}
            className={({ isActive }) => `cockpit-tab -mb-px${isActive ? ' active' : ''}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      {/* Panel outlet */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}
