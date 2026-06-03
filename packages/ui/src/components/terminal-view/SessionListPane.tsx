import { useState } from 'react'
import { getSessionTitle } from '../../lib/sessionTitle.js'
import { useStore } from '../../store/index.js'
import type { SessionRecord } from '../../store/index.js'
import type { Workflow } from './useWorkflows.js'
import { WorkflowChatPanel } from './WorkflowChatPanel.js'

interface Props {
  workflow: Workflow | null
  activeSessions: SessionRecord[]
  allWorkflows: Workflow[]
  onLaunch: () => void
}

const MONO: React.CSSProperties = {
  fontFamily: '"DM Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
}
const UI: React.CSSProperties = {
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
}

function timeAgo(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function SessionItem({ session }: { session: SessionRecord }) {
  const selectedSessionId = useStore((s) => s.selectedSessionId)
  const selectSession = useStore((s) => s.selectSession)
  const isSelected = selectedSessionId === session.sessionId
  const title = getSessionTitle(session.workspacePath, session.sessionId)

  return (
    <button
      type="button"
      onClick={() => selectSession(session.sessionId)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        width: '100%',
        padding: '10px 16px',
        textAlign: 'left',
        background: isSelected ? 'rgba(232,232,240,0.05)' : 'none',
        border: 'none',
        borderLeft: isSelected ? '2px solid var(--w-ink)' : '2px solid transparent',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(232,232,240,0.025)'
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'none'
      }}
    >
      {/* Status dot — green pulse for active */}
      <div style={{ paddingTop: '5px', flexShrink: 0 }}>
        <span className="status-ping status-ping-active" style={{ width: '6px', height: '6px', display: 'block' }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
          <span
            style={{
              ...UI,
              fontSize: '13px',
              fontWeight: 400,
              color: isSelected ? 'var(--w-ink)' : 'var(--w-body-strong)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {title}
          </span>
          <span style={{ ...MONO, fontSize: '10px', color: 'var(--w-muted)', flexShrink: 0 }}>
            {timeAgo(session.lastEventAt)}
          </span>
        </div>
        <div style={{ ...MONO, fontSize: '10px', color: 'var(--w-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session.workspacePath.replace(/^\/Users\/[^/]+/, '~')}
        </div>
      </div>

      {session.pendingApprovals > 0 && (
        <span
          style={{
            flexShrink: 0,
            background: '#c9430a',
            color: '#f7f5f0',
            borderRadius: '9999px',
            fontSize: '9px',
            fontWeight: 500,
            padding: '1px 6px',
            lineHeight: '16px',
            marginTop: '2px',
          }}
        >
          {session.pendingApprovals}
        </span>
      )}
    </button>
  )
}

export function SessionListPane({ workflow, activeSessions, allWorkflows, onLaunch }: Props) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'agents' | 'messages'>('agents')
  const workflowMessages = useStore((s) => s.workflowMessages)
  const messageCount = workflow ? (workflowMessages[workflow.id]?.length ?? 0) : 0

  if (!workflow) {
    return (
      <div
        style={{
          width: '280px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--w-canvas)',
          borderRight: '1px solid var(--w-hairline)',
        }}
      >
        <p style={{ ...MONO, fontSize: '11px', color: 'var(--w-muted)', letterSpacing: '0.1em' }}>
          select a workflow
        </p>
      </div>
    )
  }

  const q = search.trim().toLowerCase()
  const filtered = activeSessions.filter(
    (s) => !q || getSessionTitle(s.workspacePath, s.sessionId).toLowerCase().includes(q),
  )

  return (
    <div
      style={{
        width: '280px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--w-canvas)',
        borderRight: '1px solid var(--w-hairline)',
        overflow: 'hidden',
      }}
    >
      {/* Tabs */}
      <div style={{ flexShrink: 0, display: 'flex', borderBottom: '1px solid var(--w-hairline)' }}>
        {(['agents', 'messages'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              ...MONO,
              fontSize: '9px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              flex: 1,
              padding: '9px 0',
              background: 'none',
              border: 'none',
              borderBottom: tab === t ? '2px solid var(--w-ink)' : '2px solid transparent',
              cursor: 'pointer',
              color: tab === t ? 'var(--w-ink)' : 'var(--w-muted)',
              transition: 'color 0.1s',
            }}
          >
            {t === 'messages' && messageCount > 0 ? `messages (${messageCount})` : t}
          </button>
        ))}
      </div>

      {tab === 'agents' ? (
        <>
          {/* Search */}
          <div style={{ flexShrink: 0, padding: '10px 12px', borderBottom: '1px solid var(--w-hairline)' }}>
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                ...UI,
                fontSize: '13px',
                width: '100%',
                background: 'var(--w-canvas-soft)',
                color: 'var(--w-ink)',
                border: '1px solid var(--w-hairline)',
                borderRadius: '3px',
                padding: '6px 10px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--w-body)' }}
              onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--w-hairline)' }}
            />
          </div>

          {/* Active section header */}
          {filtered.length > 0 && (
            <div style={{ padding: '10px 16px 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ ...MONO, fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--w-muted)' }}>
                Active
              </span>
            </div>
          )}

          {/* Session list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.map((s) => <SessionItem key={s.sessionId} session={s} />)}
            {filtered.length === 0 && (
              <p style={{ ...MONO, fontSize: '11px', color: 'var(--w-muted)', padding: '24px 16px', textAlign: 'center' }}>
                {q ? 'No results' : 'No active agents'}
              </p>
            )}
          </div>
        </>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <WorkflowChatPanel workflow={workflow} allWorkflows={allWorkflows} />
        </div>
      )}

      {/* New conversation */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--w-hairline)', padding: '8px' }}>
        <button
          type="button"
          onClick={onLaunch}
          style={{
            ...UI,
            fontSize: '13px',
            fontWeight: 400,
            color: 'var(--w-body)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            padding: '8px 10px',
            borderRadius: '3px',
            textAlign: 'left',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(232,232,240,0.04)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none' }}
        >
          <span style={{ ...MONO, fontSize: '14px', color: 'var(--w-muted)' }}>+</span>
          New conversation
        </button>
      </div>
    </div>
  )
}
