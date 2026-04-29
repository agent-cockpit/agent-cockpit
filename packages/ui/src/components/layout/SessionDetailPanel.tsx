import { useEffect, useState } from 'react'
import { NavLink, Outlet, useParams } from 'react-router'
import { DAEMON_URL } from '../../lib/daemonUrl.js'
import { getSessionTitle } from '../../lib/sessionTitle.js'
import type { PanelId } from '../../store/index.js'
import { useStore } from '../../store/index.js'
import { getProviderAccentStyle } from '../providerAccent.js'

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
  const historySummary = useStore((s) => (sessionId ? s.historySessions[sessionId] : undefined))
  const [resumeStatus, setResumeStatus] = useState<'idle' | 'pending' | 'error'>('idle')
  const [resumeError, setResumeError] = useState<string | null>(null)

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

  const taskTitle = historySummary?.taskTitle?.trim() ?? ''
  const projectName =
    historySummary?.title?.trim() ||
    taskTitle ||
    getSessionTitle(session.workspacePath, session.sessionId)
  const tags = historySummary?.tags ?? []
  const branch = historySummary?.branch?.trim() || null
  const projectId = historySummary?.projectId ?? session.projectId ?? null
  const parentSessionId = historySummary?.parentSessionId ?? session.parentSessionId ?? null
  const childCount = (historySummary?.childSessionIds ?? session.childSessionIds ?? []).length
  const managedByDaemon = session.managedByDaemon === true || historySummary?.capabilities?.managedByDaemon === true
  const providerSupportsResume = session.provider === 'codex' || session.provider === 'claude'
  const showResumeControl = session.status !== 'active'
  const canResume = showResumeControl && providerSupportsResume && managedByDaemon
  const resumeTitle = canResume
    ? session.provider === 'claude'
      ? 'Continue Claude session with --continue'
      : 'Resume Codex session from saved thread'
    : !managedByDaemon
      ? 'External sessions can be inspected, but cannot be resumed from Agent Cockpit.'
      : 'Resume is only supported for daemon-managed Claude and Codex sessions.'

  async function handleResume(): Promise<void> {
    if (!sessionId) return
    setResumeStatus('pending')
    setResumeError(null)
    try {
      const response = await fetch(`${DAEMON_URL}/api/sessions/${encodeURIComponent(sessionId)}/resume`, {
        method: 'POST',
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(payload?.error ?? 'Resume failed.')
      }
      setResumeStatus('idle')
    } catch (error) {
      setResumeStatus('error')
      setResumeError(error instanceof Error ? error.message : 'Resume failed.')
    }
  }

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
        {branch && (
          <span
            data-testid="session-branch-badge"
            className="border border-[var(--color-cockpit-cyan)]/35 px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-cockpit-cyan)]"
            title={`Branch: ${branch}`}
          >
            {branch}
          </span>
        )}
        {projectId && (
          <span
            data-testid="session-project-badge"
            className="border border-[var(--color-cockpit-cyan)]/35 px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-cockpit-cyan)]"
            title={`Project ID: ${projectId}`}
          >
            {projectId}
          </span>
        )}
        {tags.map((tag) => (
          <span
            key={tag}
            className="border border-[var(--color-cockpit-cyan)]/35 px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-cockpit-cyan)]"
          >
            {tag}
          </span>
        ))}
        {parentSessionId && (
          <span
            data-testid="session-parent-badge"
            className="border border-[var(--color-cockpit-amber)]/45 px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-cockpit-amber)]"
            title={`Parent session: ${parentSessionId}`}
          >
            parent {parentSessionId.slice(0, 8)}
          </span>
        )}
        {childCount > 0 && (
          <span
            data-testid="session-children-badge"
            className="border border-[var(--color-cockpit-amber)]/45 px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-cockpit-amber)]"
            title={`${childCount} child session${childCount === 1 ? '' : 's'}`}
          >
            {childCount} child{childCount === 1 ? '' : 'ren'}
          </span>
        )}
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
        <span className="ml-auto data-readout text-[10px] tabular-nums">
          {new Date(session.startedAt).toLocaleString()}
        </span>
        {showResumeControl && (
          <button
            type="button"
            onClick={() => void handleResume()}
            disabled={!canResume || resumeStatus === 'pending'}
            className="cockpit-btn py-0.5 text-[9px] disabled:cursor-not-allowed disabled:opacity-45"
            data-testid="session-resume-button"
            title={resumeTitle}
          >
            {resumeStatus === 'pending' ? 'Resuming…' : 'Resume'}
          </button>
        )}
      </div>
      {resumeError && (
        <div
          className="border-b border-red-500/40 bg-red-500/10 px-4 py-1 text-[10px] [font-family:var(--font-mono-data)] text-red-300"
          data-testid="session-resume-error"
        >
          {resumeError}
        </div>
      )}

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
