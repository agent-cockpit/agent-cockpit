import { useEffect, useRef } from 'react'
import {
  attachTerminalSessionPassive,
  detachTerminalSession,
  scheduleTerminalResize,
} from '../../lib/terminalSessions.js'
import { useStore } from '../../store/index.js'
import { getSessionTitle } from '../../lib/sessionTitle.js'
import type { SessionRecord } from '../../store/index.js'

interface Props {
  sessions: SessionRecord[]
  onNewSession: () => void
}

const MONO: React.CSSProperties = {
  fontFamily: '"DM Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
}
const UI: React.CSSProperties = {
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
}

function TerminalColumn({ session }: { session: SessionRecord }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const selectedSessionId = useStore((s) => s.selectedSessionId)
  const selectSession = useStore((s) => s.selectSession)
  const isInPopup = useStore((s) => !!s.popupWindows[session.sessionId])
  const isSelected = selectedSessionId === session.sessionId
  const title = getSessionTitle(session.workspacePath, session.sessionId)

  useEffect(() => {
    if (isInPopup) return
    const container = containerRef.current
    if (!container) return

    let initialized = false
    const observer = new ResizeObserver(() => {
      if (container.clientWidth === 0 || container.clientHeight === 0) return
      if (!initialized) {
        initialized = true
        attachTerminalSessionPassive(session.sessionId, container)
        return
      }
      scheduleTerminalResize(session.sessionId)
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
      detachTerminalSession(session.sessionId, container)
    }
  }, [session.sessionId, isInPopup])

  return (
    <div
      style={{
        flex: 1,
        minWidth: '300px',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--w-hairline)',
        outline: isSelected ? '1px solid var(--color-cockpit-accent)' : 'none',
        outlineOffset: '-1px',
        transition: 'outline 0.1s',
      }}
      onClick={() => selectSession(session.sessionId)}
    >
      {/* Column header */}
      <div
        style={{
          flexShrink: 0,
          height: '32px',
          borderBottom: '1px solid var(--w-hairline)',
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--w-canvas-soft)',
          cursor: 'default',
        }}
      >
        <span
          className="status-ping status-ping-active"
          style={{ width: '5px', height: '5px', flexShrink: 0, display: 'block' }}
        />
        <span
          style={{
            ...UI,
            fontSize: '12px',
            fontWeight: isSelected ? 500 : 400,
            color: isSelected ? 'var(--w-ink)' : 'var(--w-body)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        {session.pendingApprovals > 0 && (
          <span
            style={{
              flexShrink: 0,
              background: 'var(--color-cockpit-amber)',
              color: 'var(--color-background)',
              borderRadius: '9999px',
              fontSize: '9px',
              fontWeight: 600,
              padding: '1px 5px',
              lineHeight: '14px',
            }}
          >
            {session.pendingApprovals}
          </span>
        )}
      </div>

      {/* Terminal body */}
      <div style={{ flex: 1, overflow: 'hidden', background: 'var(--w-canvas)' }}>
        {isInPopup ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <p style={{ ...MONO, fontSize: '10px', letterSpacing: '0.12em', color: 'var(--w-muted)' }}>
              open in popup
            </p>
          </div>
        ) : (
          <div ref={containerRef} style={{ height: '100%', width: '100%', overflow: 'hidden' }} />
        )}
      </div>
    </div>
  )
}

export function MainTerminalPane({ sessions, onNewSession }: Props) {

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--w-canvas)',
      }}
    >
      {/* Terminal columns */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {sessions.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <p style={{ ...MONO, fontSize: '11px', letterSpacing: '0.14em', color: 'var(--w-muted)' }}>
              no active agents
            </p>
          </div>
        ) : (
          sessions.map((s) => <TerminalColumn key={s.sessionId} session={s} />)
        )}
      </div>

      {/* Launch prompt bar */}
      <button
        type="button"
        onClick={onNewSession}
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          background: 'var(--w-canvas-soft)',
          padding: '12px 20px',
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          border: 'none',
          borderTop: '1px solid var(--w-hairline)',
        } as React.CSSProperties}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'oklch(0.13 0.016 264)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--w-canvas-soft)' }}
      >
        <span style={{ ...UI, fontSize: '13px', color: 'var(--w-muted)', flex: 1 }}>
          Run commands
        </span>

        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <kbd
            style={{
              ...MONO,
              fontSize: '10px',
              color: 'var(--w-muted)',
              background: 'var(--w-canvas)',
              border: '1px solid var(--w-hairline)',
              borderRadius: '2px',
              padding: '2px 5px',
            }}
          >
            ⌘↵
          </kbd>
          <span style={{ ...MONO, fontSize: '10px', color: 'var(--w-muted)' }}>
            new /agent session
          </span>
        </span>
      </button>
    </div>
  )
}
