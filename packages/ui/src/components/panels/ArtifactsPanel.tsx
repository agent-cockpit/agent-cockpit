import { useEffect, useMemo, useState } from 'react'
import type { NormalizedEvent } from '@cockpit/shared'
import { useStore } from '../../store/index.js'
import { EMPTY_EVENTS } from '../../store/eventsSlice.js'
import { DAEMON_URL } from '../../lib/daemonUrl.js'
import { usePanelSessionId } from './sessionScope.js'

interface ArtifactItem {
  id: string
  filePath: string
  changeType: 'created' | 'modified' | 'deleted'
  source: 'file_change' | 'tool_call'
  timestamp: string
  diff?: string
}

interface LogItem {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error'
  label: string
  message: string
}

function getEventSequence(event: NormalizedEvent, index: number): string {
  const seq = (event as NormalizedEvent & { sequenceNumber?: number }).sequenceNumber
  return seq !== undefined ? `seq-${seq}` : `idx-${index}`
}

function maybeGetFilePath(input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const payload = input as Record<string, unknown>
  const directPath = payload['path']
  if (typeof directPath === 'string' && directPath.length > 0) return directPath
  const fallbackPath = payload['file_path']
  if (typeof fallbackPath === 'string' && fallbackPath.length > 0) return fallbackPath
  return null
}

function maybeGetToolDiff(input: unknown, filePath?: string): string | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const payload = input as Record<string, unknown>
  const oldString = typeof payload['old_string'] === 'string' ? payload['old_string'] : null
  const newString = typeof payload['new_string'] === 'string' ? payload['new_string'] : null
  if (oldString === null && newString === null) return undefined
  const oldLines = oldString?.split('\n') ?? []
  const newLines = newString?.split('\n') ?? []
  const aFile = filePath ? `a/${filePath}` : 'a/file'
  const bFile = filePath ? `b/${filePath}` : 'b/file'
  return [
    `--- ${aFile}`,
    `+++ ${bFile}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join('\n')
}

function deriveArtifacts(events: NormalizedEvent[]): ArtifactItem[] {
  const items: ArtifactItem[] = []

  events.forEach((event, index) => {
    const id = getEventSequence(event, index)
    if (event.type === 'file_change') {
      items.push({
        id: `file-${id}`,
        filePath: event.filePath,
        changeType: event.changeType,
        source: 'file_change',
        timestamp: event.timestamp,
        diff: event.diff,
      })
      return
    }

    if (event.type === 'tool_call') {
      if (!['Write', 'Edit', 'Update', 'MultiEdit'].includes(event.toolName)) return
      const filePath = maybeGetFilePath(event.input)
      if (!filePath) return
      items.push({
        id: `tool-${id}`,
        filePath,
        changeType: event.toolName === 'Write' ? 'created' : 'modified',
        source: 'tool_call',
        timestamp: event.timestamp,
        diff: maybeGetToolDiff(event.input, filePath),
      })
    }
  })

  return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

type ApprovalRequestMap = Map<string, { actionType: string; proposedAction: string }>

function deriveLogFromEvent(event: NormalizedEvent, index: number, approvalRequests?: ApprovalRequestMap): LogItem {
  const id = getEventSequence(event, index)
  if (event.type === 'session_start') {
    return {
      id,
      timestamp: event.timestamp,
      level: 'info',
      label: 'Session Started',
      message: `${event.provider} @ ${event.workspacePath}`,
    }
  }
  if (event.type === 'session_end') {
    return {
      id,
      timestamp: event.timestamp,
      level: 'info',
      label: 'Session Ended',
      message: event.exitCode !== undefined ? `Exit code: ${event.exitCode}` : 'Session finished',
    }
  }
  if (event.type === 'tool_call') {
    return {
      id,
      timestamp: event.timestamp,
      level: 'info',
      label: 'Tool Call',
      message: event.toolName,
    }
  }
  if (event.type === 'file_change') {
    return {
      id,
      timestamp: event.timestamp,
      level: 'info',
      label: 'File Change',
      message: `${event.changeType.toUpperCase()} ${event.filePath}`,
    }
  }
  if (event.type === 'approval_request') {
    return {
      id,
      timestamp: event.timestamp,
      level: event.riskLevel === 'critical' || event.riskLevel === 'high' ? 'warn' : 'info',
      label: 'Approval Requested',
      message: `${event.actionType} (${event.riskLevel})`,
    }
  }
  if (event.type === 'approval_resolved') {
    const req = approvalRequests?.get(event.approvalId)
    const detail = req ? `${req.actionType}: ${req.proposedAction.slice(0, 60)}${req.proposedAction.length > 60 ? '…' : ''}` : ''
    return {
      id,
      timestamp: event.timestamp,
      level: event.decision === 'denied' || event.decision === 'timeout' ? 'warn' : 'info',
      label: 'Approval Resolved',
      message: detail ? `${event.decision} — ${detail}` : event.decision,
    }
  }
  if (event.type === 'subagent_spawn') {
    return {
      id,
      timestamp: event.timestamp,
      level: 'info',
      label: 'Subagent Spawned',
      message: event.subagentSessionId,
    }
  }
  if (event.type === 'subagent_complete') {
    return {
      id,
      timestamp: event.timestamp,
      level: event.success ? 'info' : 'warn',
      label: 'Subagent Completed',
      message: `${event.subagentSessionId} (${event.success ? 'success' : 'failed'})`,
    }
  }
  if (event.type === 'memory_read') {
    return {
      id,
      timestamp: event.timestamp,
      level: 'info',
      label: 'Memory Read',
      message: event.memoryKey,
    }
  }
  if (event.type === 'memory_write') {
    return {
      id,
      timestamp: event.timestamp,
      level: event.suggested ? 'warn' : 'info',
      label: 'Memory Write',
      message: `${event.memoryKey}${event.suggested ? ' (suggested)' : ''}`,
    }
  }
  if (event.type === 'provider_parse_error') {
    return {
      id,
      timestamp: event.timestamp,
      level: 'error',
      label: 'Provider Parse Error',
      message: event.errorMessage,
    }
  }
  if (event.type === 'session_chat_message') {
    return {
      id,
      timestamp: event.timestamp,
      level: 'info',
      label: `Chat ${event.role}`,
      message: event.content.slice(0, 140),
    }
  }
  if (event.type === 'session_chat_error') {
    return {
      id,
      timestamp: event.timestamp,
      level: 'warn',
      label: 'Chat Error',
      message: event.reason,
    }
  }
  if (event.type === 'session_usage') {
    return {
      id,
      timestamp: event.timestamp,
      level: 'info',
      label: 'Usage Updated',
      message: `in ${event.inputTokens} · out ${event.outputTokens}`,
    }
  }
  return {
    id,
    timestamp: event.timestamp,
    level: 'info',
    label: event.type,
    message: '',
  }
}

function logLevelClass(level: LogItem['level']): string {
  if (level === 'error') return 'text-[var(--color-cockpit-red)]'
  if (level === 'warn') return 'text-[var(--color-cockpit-amber)]'
  return 'text-[var(--color-cockpit-accent)]'
}

function changeTypeClass(type: ArtifactItem['changeType']): string {
  if (type === 'created') return 'text-[var(--color-cockpit-green)]'
  if (type === 'deleted') return 'text-[var(--color-cockpit-red)]'
  return 'text-[var(--color-cockpit-amber)]'
}

export function ArtifactsPanel() {
  const sessionId = usePanelSessionId()
  const events = useStore((s) => (sessionId ? s.events[sessionId] : EMPTY_EVENTS) ?? EMPTY_EVENTS)
  const bulkApplyEvents = useStore((s) => s.bulkApplyEvents)
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequestMap>(new Map())

  useEffect(() => {
    if (!sessionId) return
    if (events.length > 0) return
    fetch(`${DAEMON_URL}/api/sessions/${sessionId}/events`)
      .then((r) => r.json())
      .then((evs: unknown) => {
        bulkApplyEvents(sessionId, Array.isArray(evs) ? (evs as NormalizedEvent[]) : [])
      })
      .catch(() => {
        /* ignore fetch failures and keep live stream data */
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Intentionally omit bulkApplyEvents — it's a stable store action; adding it would re-run
    // this fetch on every render cycle. If the store is refactored, verify stability is preserved.
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    fetch(`${DAEMON_URL}/api/sessions/${sessionId}/approvals`)
      .then((r) => r.json())
      .then((rows: { approvalId: string; actionType: string; proposedAction: string }[]) => {
        const map: ApprovalRequestMap = new Map()
        rows.forEach((row) => map.set(row.approvalId, { actionType: row.actionType, proposedAction: row.proposedAction }))
        setApprovalRequests(map)
      })
      .catch(() => {})
  }, [sessionId])

  const artifacts = useMemo(() => deriveArtifacts(events), [events])
  const logs = useMemo(
    () => [...events].map((event, index) => deriveLogFromEvent(event, index, approvalRequests)).reverse(),
    [events, approvalRequests],
  )

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <span className="cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }}>
          -- NO SESSION SELECTED --
        </span>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-4 border-b border-border bg-[var(--color-panel-surface)] px-4 py-2">
        <span className="data-readout text-[10px]">
          <span className="data-readout-dim">ARTIFACTS:&nbsp;</span>
          <span className="tabular-nums">{String(artifacts.length).padStart(2, '0')}</span>
        </span>
        <span className="data-readout text-[10px]">
          <span className="data-readout-dim">LOG LINES:&nbsp;</span>
          <span className="tabular-nums">{String(logs.length).padStart(2, '0')}</span>
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <section className="min-h-0 border-b border-border lg:border-r lg:border-b-0">
          <header className="border-b border-border px-3 py-2">
            <h2 className="cockpit-label">Artifacts</h2>
          </header>
          <div className="h-full overflow-y-auto p-2">
            {artifacts.length === 0 ? (
              <p className="p-3 text-xs data-readout-dim">No artifacts yet.</p>
            ) : (
              artifacts.map((artifact) => (
                <details
                  key={artifact.id}
                  className="mb-2 border border-border/60 bg-[var(--color-panel-surface)] p-2"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center gap-2">
                      <span className={`[font-family:var(--font-mono-data)] text-[9px] uppercase ${changeTypeClass(artifact.changeType)}`}>
                        {artifact.changeType}
                      </span>
                      <span className="min-w-0 flex-1 truncate [font-family:var(--font-mono-data)] text-[11px] text-foreground">
                        {artifact.filePath}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] data-readout-dim">
                      <span>{new Date(artifact.timestamp).toLocaleTimeString()}</span>
                      <span>{artifact.source === 'file_change' ? 'hook' : 'tool'}</span>
                    </div>
                  </summary>
                  {artifact.diff && (
                    <pre className="mt-2 max-h-56 overflow-auto border border-border/50 bg-background/50 p-2 text-[10px] text-muted-foreground [font-family:var(--font-mono-data)] whitespace-pre-wrap">
                      {artifact.diff}
                    </pre>
                  )}
                </details>
              ))
            )}
          </div>
        </section>

        <section className="min-h-0">
          <header className="border-b border-border px-3 py-2">
            <h2 className="cockpit-label">Logs</h2>
          </header>
          <div className="h-full overflow-y-auto">
            {logs.length === 0 ? (
              <p className="p-5 text-xs data-readout-dim">No log entries yet.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="border-b border-border/40 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="data-readout-dim text-[10px] tabular-nums">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className={`[font-family:var(--font-mono-data)] text-[10px] uppercase tracking-wide ${logLevelClass(log.level)}`}>
                      {log.label}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground [font-family:var(--font-mono-data)]">
                    {log.message}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
