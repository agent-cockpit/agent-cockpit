import { useEffect } from 'react'
import { useParams, NavLink, Outlet } from 'react-router'
import { useStore } from '../../store/index.js'
import type { PanelId } from '../../store/index.js'

const TABS: { id: PanelId; label: string }[] = [
  { id: 'approvals', label: 'Approvals' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'diff', label: 'Diff' },
  { id: 'memory', label: 'Memory' },
  { id: 'artifacts', label: 'Artifacts' },
]

const STATUS_DOT: Record<string, string> = {
  active: 'bg-green-500',
  ended: 'bg-gray-400',
  error: 'bg-red-500',
}

const PROVIDER_BADGE: Record<string, string> = {
  claude: 'bg-blue-100 text-blue-700',
  codex: 'bg-purple-100 text-purple-700',
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

  const projectName = session.workspacePath.split('/').at(-1) ?? session.workspacePath

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${PROVIDER_BADGE[session.provider] ?? ''}`}
        >
          {session.provider}
        </span>
        <span className="text-sm font-semibold truncate">{projectName}</span>
        <span
          className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[session.status] ?? 'bg-gray-400'}`}
          title={session.status}
        />
        {session.pendingApprovals > 0 && (
          <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-xs text-white">
            {session.pendingApprovals}
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(session.startedAt).toLocaleString()}
        </span>
      </div>

      {/* Tab strip */}
      <div className="flex border-b shrink-0 px-4">
        {TABS.map((tab) => (
          <NavLink
            key={tab.id}
            to={`/session/${sessionId}/${tab.id}`}
            className={({ isActive }) =>
              [
                'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')
            }
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
