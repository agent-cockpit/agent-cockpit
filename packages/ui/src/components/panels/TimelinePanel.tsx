import { useEffect, useMemo, useRef, useState } from 'react'
import type { NormalizedEvent } from '@agentcockpit/shared'
import { Link, useNavigate } from 'react-router'
import { useStore } from '../../store/index.js'
import { EMPTY_EVENTS } from '../../store/eventsSlice.js'
import { DAEMON_URL } from '../../lib/daemonUrl.js'
import { formatReplayCursor, sliceEventsForReplay } from '../../lib/replay.js'
import { usePanelSessionId } from './sessionScope.js'

const EVENT_TYPE_LABELS: Record<string, string> = {
  session_start: 'Session Started',
  session_end: 'Session Ended',
  session_resumed: 'Session Resumed',
  task_created: 'Task Created',
  task_updated: 'Task Updated',
  command_started: 'Command Started',
  command_completed: 'Command Completed',
  tool_call: 'Tool Call',
  tool_called: 'Tool Called',
  tool_completed: 'Tool Completed',
  file_change: 'File Change',
  approval_request: 'Approval Requested',
  approval_resolved: 'Approval Resolved',
  subagent_spawn: 'Subagent Spawned',
  subagent_complete: 'Subagent Completed',
  memory_read: 'Memory Read',
  memory_write: 'Memory Written',
  provider_parse_error: 'Parse Error',
  session_chat_message: 'Chat Message',
  session_chat_error: 'Chat Error',
}

type EventWithSeq = NormalizedEvent & { sequenceNumber?: number }
type RelatedEvent = {
  event: NormalizedEvent
  origIdx: number
  reason: 'correlation' | 'parent' | 'child'
}

function rowKeyFor(event: NormalizedEvent, origIdx: number): number | string {
  return (event as EventWithSeq).sequenceNumber ?? `idx-${origIdx}`
}

function relatedEventsFor(events: NormalizedEvent[], event: NormalizedEvent, origIdx: number): RelatedEvent[] {
  const current = event as EventWithSeq
  const correlationId = (event as { correlationId?: string }).correlationId
  const parentEventId = (event as { parentEventId?: number }).parentEventId
  return events
    .map((candidate, candidateIdx) => ({ candidate, candidateIdx }))
    .filter(({ candidateIdx }) => candidateIdx !== origIdx)
    .map(({ candidate, candidateIdx }): RelatedEvent | null => {
      const candidateSeq = (candidate as EventWithSeq).sequenceNumber
      const candidateCorrelation = (candidate as { correlationId?: string }).correlationId
      const candidateParent = (candidate as { parentEventId?: number }).parentEventId
      if (parentEventId && candidateSeq === parentEventId) {
        return { event: candidate, origIdx: candidateIdx, reason: 'parent' }
      }
      if (current.sequenceNumber && candidateParent === current.sequenceNumber) {
        return { event: candidate, origIdx: candidateIdx, reason: 'child' }
      }
      if (correlationId && candidateCorrelation === correlationId) {
        return { event: candidate, origIdx: candidateIdx, reason: 'correlation' }
      }
      return null
    })
    .filter((entry): entry is RelatedEvent => entry !== null)
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="[font-family:var(--font-mono-data)]">
      <span className="cockpit-label">{label}:&nbsp;</span>
      <span className="text-muted-foreground">{value}</span>
    </div>
  )
}

function EventLinkFields({
  event,
  relatedEvents,
  onJump,
}: {
  event: NormalizedEvent
  relatedEvents: RelatedEvent[]
  onJump: (origIdx: number) => void
}) {
  const links = event as NormalizedEvent & { parentEventId?: number; correlationId?: string }
  if (!links.correlationId && !links.parentEventId) return null
  return (
    <div className="mt-1 border-t border-border/40 pt-1">
      {links.correlationId && <Field label="Correlation" value={links.correlationId} />}
      {links.parentEventId && <Field label="Parent event" value={String(links.parentEventId)} />}
      {relatedEvents.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1 [font-family:var(--font-mono-data)]">
          <span className="cockpit-label">Related:&nbsp;</span>
          {relatedEvents.map(({ event: related, origIdx, reason }) => {
            const seq = (related as EventWithSeq).sequenceNumber ?? origIdx + 1
            return (
              <button
                key={`${reason}-${seq}-${origIdx}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onJump(origIdx)
                }}
                data-testid="timeline-related-event-link"
                className="border border-border/60 px-1 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground hover:border-[var(--color-cockpit-accent)] hover:text-[var(--color-cockpit-accent)]"
                title={`Jump to ${EVENT_TYPE_LABELS[related.type] ?? related.type}`}
              >
                #{seq} {EVENT_TYPE_LABELS[related.type] ?? related.type}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PanelJumpButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="mt-1 border border-border/60 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground hover:border-[var(--color-cockpit-accent)] hover:text-[var(--color-cockpit-accent)] [font-family:var(--font-mono-data)]"
    >
      {label}
    </button>
  )
}

function InlineDetail({
  event,
  relatedEvents,
  onJump,
  sessionId,
  onJumpToPanel,
}: {
  event: NormalizedEvent
  relatedEvents: RelatedEvent[]
  onJump: (origIdx: number) => void
  sessionId: string
  onJumpToPanel: (panel: 'diff' | 'approvals', filePath?: string) => void
}) {
  const base = 'px-4 py-2 bg-[var(--color-panel-surface)] text-xs border-b border-border/50 text-muted-foreground'
  const linkFields = <EventLinkFields event={event} relatedEvents={relatedEvents} onJump={onJump} />

  if (event.type === 'tool_call' || event.type === 'tool_called') {
    return (
      <div className={base}>
        <div className="[font-family:var(--font-mono-data)] font-medium text-[var(--color-cockpit-accent)]">{event.toolName}</div>
        <pre className="mt-1 whitespace-pre-wrap text-muted-foreground [font-family:var(--font-mono-data)]">
          {JSON.stringify(event.input, null, 2)}
        </pre>
        {linkFields}
      </div>
    )
  }

  if (event.type === 'file_change') {
    return (
      <div className={base}>
        <div className="[font-family:var(--font-mono-data)] text-[var(--color-cockpit-accent)]">
          {event.filePath}{' '}
          <span className="text-muted-foreground">({event.changeType})</span>
        </div>
        {event.diff && (
          <pre className="mt-1 whitespace-pre text-muted-foreground overflow-x-auto [font-family:var(--font-mono-data)]">{event.diff}</pre>
        )}
        <PanelJumpButton label="→ Diff" onClick={() => onJumpToPanel('diff', event.filePath)} />
        {linkFields}
      </div>
    )
  }

  if (event.type === 'approval_request') {
    return (
      <div className={base}>
        <div className="[font-family:var(--font-mono-data)]">
          <span className="cockpit-label">Action:&nbsp;</span>{event.proposedAction}
        </div>
        <div className="[font-family:var(--font-mono-data)]">
          <span className="cockpit-label">Risk:&nbsp;</span>{event.riskLevel}
        </div>
        {event.whyRisky && (
          <div className="[font-family:var(--font-mono-data)]">
            <span className="cockpit-label">Why risky:&nbsp;</span>{event.whyRisky}
          </div>
        )}
        <PanelJumpButton label="→ Approvals" onClick={() => onJumpToPanel('approvals')} />
        {linkFields}
      </div>
    )
  }

  if (event.type === 'approval_resolved') {
    return (
      <div className={base}>
        <Field label="Decision" value={event.decision} />
        <Field label="ID" value={event.approvalId.slice(0, 8)} />
        {linkFields}
      </div>
    )
  }

  if (event.type === 'session_start') {
    return (
      <div className={base}>
        <Field label="Provider" value={event.provider} />
        <Field label="Workspace" value={event.workspacePath} />
      </div>
    )
  }

  if (event.type === 'session_end') {
    return (
      <div className={base}>
        <Field label="Provider" value={event.provider} />
        {event.exitCode !== undefined && <Field label="Exit code" value={String(event.exitCode)} />}
        {event.failureReason && (
          <pre
            data-testid="session-end-failure-reason"
            className="mt-1 whitespace-pre-wrap [font-family:var(--font-mono-data)] text-[var(--color-cockpit-red)] max-h-40 overflow-y-auto"
          >
            {event.failureReason.slice(0, 600)}{event.failureReason.length > 600 ? '…' : ''}
          </pre>
        )}
      </div>
    )
  }

  if (event.type === 'session_resumed') {
    return (
      <div className={base}>
        <Field label="Provider" value={event.provider} />
        {event.resumeSource && <Field label="Resume source" value={event.resumeSource} />}
        {event.workspacePath && <Field label="Workspace" value={event.workspacePath} />}
        {event.branch && <Field label="Branch" value={event.branch} />}
        {event.providerThreadId && <Field label="Provider thread" value={event.providerThreadId.slice(0, 12)} />}
        {event.lastPrompt && <Field label="Last prompt" value={event.lastPrompt} />}
      </div>
    )
  }

  if (event.type === 'subagent_spawn') {
    return (
      <div className={base}>
        <Field label="Subagent ID" value={event.subagentSessionId.slice(0, 8)} />
      </div>
    )
  }

  if (event.type === 'subagent_complete') {
    return (
      <div className={base}>
        <Field label="Subagent ID" value={event.subagentSessionId.slice(0, 8)} />
        <Field label="Success" value={event.success ? 'yes' : 'no'} />
      </div>
    )
  }

  if (event.type === 'memory_read') {
    return (
      <div className={base}>
        <Field label="Key" value={event.memoryKey} />
        <div className="mt-1">
          <Link
            to={`/session/${sessionId}/memory?q=${encodeURIComponent(event.memoryKey)}`}
            className="border border-[var(--color-cockpit-accent)]/35 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-[var(--color-cockpit-accent)]"
            data-testid="memory-search-link"
          >
            Open Memory
          </Link>
        </div>
      </div>
    )
  }

  if (event.type === 'memory_write') {
    return (
      <div className={base}>
        <Field label="Key" value={event.memoryKey} />
        <div className="[font-family:var(--font-mono-data)] mt-1">
          <span className="cockpit-label">Value:&nbsp;</span>
          <span className="text-muted-foreground whitespace-pre-wrap">{event.value}</span>
        </div>
        <div className="mt-1">
          <Link
            to={`/session/${sessionId}/memory?q=${encodeURIComponent(event.memoryKey)}`}
            className="border border-[var(--color-cockpit-accent)]/35 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-[var(--color-cockpit-accent)]"
            data-testid="memory-search-link"
          >
            Search Notes
          </Link>
        </div>
      </div>
    )
  }

  if (event.type === 'provider_parse_error') {
    return (
      <div className={base}>
        <Field label="Provider" value={event.provider} />
        <div className="[font-family:var(--font-mono-data)] mt-1 text-[var(--color-cockpit-red)]">{event.errorMessage}</div>
        <pre className="mt-1 whitespace-pre-wrap text-muted-foreground [font-family:var(--font-mono-data)] max-h-32 overflow-y-auto">
          {event.rawPayload.slice(0, 500)}{event.rawPayload.length > 500 ? '…' : ''}
        </pre>
      </div>
    )
  }

  if (event.type === 'session_chat_message') {
    return (
      <div className={base}>
        <Field label="Role" value={event.role} />
        <pre className="mt-1 whitespace-pre-wrap text-muted-foreground [font-family:var(--font-mono-data)] max-h-40 overflow-y-auto">
          {event.content.slice(0, 600)}{event.content.length > 600 ? '…' : ''}
        </pre>
      </div>
    )
  }

  if (event.type === 'session_chat_error') {
    return (
      <div className={base}>
        <Field label="Code" value={event.reasonCode} />
        <Field label="Reason" value={event.reason} />
      </div>
    )
  }

  if (event.type === 'task_created') {
    return (
      <div className={base}>
        {event.taskTitle && <Field label="Title" value={event.taskTitle} />}
        {event.branch && <Field label="Branch" value={event.branch} />}
        {event.workspacePath && <Field label="Workspace" value={event.workspacePath} />}
        {event.prompt && (
          <pre className="mt-1 whitespace-pre-wrap text-muted-foreground [font-family:var(--font-mono-data)] max-h-40 overflow-y-auto">
            {event.prompt.slice(0, 600)}{event.prompt.length > 600 ? '…' : ''}
          </pre>
        )}
      </div>
    )
  }

  if (event.type === 'task_updated') {
    return (
      <div className={base}>
        {event.taskTitle && <Field label="Title" value={event.taskTitle} />}
        {event.status && <Field label="Status" value={event.status} />}
        {event.summary && (
          <pre className="mt-1 whitespace-pre-wrap text-muted-foreground [font-family:var(--font-mono-data)] max-h-40 overflow-y-auto">
            {event.summary.slice(0, 600)}{event.summary.length > 600 ? '…' : ''}
          </pre>
        )}
        {event.prompt && (
          <pre className="mt-1 whitespace-pre-wrap text-muted-foreground [font-family:var(--font-mono-data)] max-h-40 overflow-y-auto">
            {event.prompt.slice(0, 600)}{event.prompt.length > 600 ? '…' : ''}
          </pre>
        )}
      </div>
    )
  }

  if (event.type === 'command_started') {
    return (
      <div className={base}>
        <Field label="Command" value={event.command} />
        {event.cwd && <Field label="Cwd" value={event.cwd} />}
        {linkFields}
      </div>
    )
  }

  if (event.type === 'command_completed') {
    return (
      <div className={base}>
        <Field label="Command" value={event.command} />
        {event.exitCode !== undefined && <Field label="Exit code" value={String(event.exitCode)} />}
        {event.durationMs !== undefined && <Field label="Duration" value={`${event.durationMs}ms`} />}
        {event.stdoutExcerpt && (
          <pre className="mt-1 whitespace-pre-wrap text-muted-foreground [font-family:var(--font-mono-data)] max-h-40 overflow-y-auto">
            {event.stdoutExcerpt}
          </pre>
        )}
        {event.stderrExcerpt && (
          <pre className="mt-1 whitespace-pre-wrap text-[var(--color-cockpit-red)] [font-family:var(--font-mono-data)] max-h-40 overflow-y-auto">
            {event.stderrExcerpt}
          </pre>
        )}
        {linkFields}
      </div>
    )
  }

  if (event.type === 'tool_completed') {
    return (
      <div className={base}>
        <Field label="Tool" value={event.toolName} />
        {event.success !== undefined && <Field label="Success" value={event.success ? 'yes' : 'no'} />}
        {event.durationMs !== undefined && <Field label="Duration" value={`${event.durationMs}ms`} />}
        {event.output !== undefined && (
          <pre className="mt-1 whitespace-pre-wrap text-muted-foreground [font-family:var(--font-mono-data)] max-h-40 overflow-y-auto">
            {typeof event.output === 'string' ? event.output : JSON.stringify(event.output, null, 2)}
          </pre>
        )}
        {linkFields}
      </div>
    )
  }

  return null
}

export function TimelinePanel() {
  const sessionId = usePanelSessionId()
  const events = useStore((s) => s.events[sessionId!] ?? EMPTY_EVENTS)
  const bulkApplyEvents = useStore((s) => s.bulkApplyEvents)
  const replayCursor = useStore((s) => (sessionId ? s.replayCursorBySession[sessionId] ?? null : null))
  const setReplayCursor = useStore((s) => s.setReplayCursor)
  const setFocusedFile = useStore((s) => s.setFocusedFile)
  const setActivePanel = useStore((s) => s.setActivePanel)
  const navigate = useNavigate()

  const [filterType, setFilterType] = useState<string | null>(null)
  const [selectedSeq, setSelectedSeq] = useState<number | string | null>(null)
  const [jumpIndex, setJumpIndex] = useState<number>(0)
  const rowRefs = useRef<Map<number, HTMLElement>>(new Map())

  function handleJumpToPanel(panel: 'diff' | 'approvals', filePath?: string) {
    if (!sessionId) return
    if (panel === 'diff' && filePath) {
      setFocusedFile(sessionId, filePath) // also sets activePanel to 'diff'
    } else {
      setActivePanel(panel)
    }
    // navigate for route mode (no-op in popup mode)
    navigate(`../../../session/${sessionId}/${panel}`)
  }

  // Hydration on mount — fetch only if empty
  useEffect(() => {
    if (!sessionId) return
    if (events.length > 0) return
    fetch(`${DAEMON_URL}/api/sessions/${sessionId}/events`)
      .then((r) => r.json())
      .then((evs: NormalizedEvent[]) => bulkApplyEvents(sessionId, evs))
      .catch(() => {
        /* silently ignore */
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]) // intentionally omit events/bulkApplyEvents — run once on mount

  // Pair each event with its original index, filter, then reverse (newest first)
  const replayEvents = useMemo(() => sliceEventsForReplay(events, replayCursor), [events, replayCursor])
  const filteredEventsWithIdx = useMemo(() => {
    const indexed = replayEvents.map((e, i) => ({ event: e, origIdx: i }))
    const cursorBound = replayEvents.length - 1
    const withCursor = indexed.filter(({ origIdx }) => origIdx <= cursorBound)
    const filtered = filterType ? withCursor.filter(({ event }) => event.type === filterType) : withCursor
    return filtered.slice().reverse()
  }, [replayEvents, filterType])

  const completionEvent = useMemo(
    () => replayEvents.find((e) => e.type === 'session_end'),
    [replayEvents],
  )

  const replaySummary = useMemo(() => {
    if (!completionEvent) return null
    const counts: Record<string, number> = {}
    for (const event of replayEvents) {
      counts[event.type] = (counts[event.type] ?? 0) + 1
    }
    return counts
  }, [replayEvents, completionEvent])

  // Jump-to targets always from UNFILTERED list
  const jumpTargets = replayEvents
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.type === 'approval_request' || e.type === 'file_change')

  function jumpNext(type?: string) {
    const targets = type ? jumpTargets.filter(({ e }) => e.type === type) : jumpTargets
    const next = targets.find(({ i }) => i > jumpIndex)
    if (next) {
      setJumpIndex(next.i)
      setFilterType(null)
      rowRefs.current.get(next.i)?.scrollIntoView({ block: 'nearest' })
    } else if (targets.length > 0) {
      const first = targets[0]!
      setJumpIndex(first.i)
      setFilterType(null)
      rowRefs.current.get(first.i)?.scrollIntoView({ block: 'nearest' })
    }
  }

  function jumpPrev(type?: string) {
    const targets = type ? jumpTargets.filter(({ e }) => e.type === type) : jumpTargets
    const prev = [...targets].reverse().find(({ i }) => i < jumpIndex)
    if (prev) {
      setJumpIndex(prev.i)
      setFilterType(null)
      rowRefs.current.get(prev.i)?.scrollIntoView({ block: 'nearest' })
    }
  }

  function jumpToEvent(origIdx: number) {
    const target = replayEvents[origIdx]
    if (!target) return
    setFilterType(null)
    if (sessionId) setReplayCursor(sessionId, null)
    setSelectedSeq(rowKeyFor(target, origIdx))
    window.setTimeout(() => {
      rowRefs.current.get(origIdx)?.scrollIntoView({ block: 'nearest' })
    }, 0)
  }

  const ALL_TYPES = [...new Set(replayEvents.map((e) => e.type))]
  const cursorMax = events.length > 0 ? events.length - 1 : 0
  const cursorValue = replayCursor ?? cursorMax

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {replaySummary && (
        <div
          className="border-b border-border bg-[var(--color-panel-surface)] px-3 py-2 [font-family:var(--font-mono-data)] text-[10px]"
          data-testid="timeline-replay-summary"
        >
          <span className="cockpit-label mr-2">Replay summary:</span>
          {Object.entries(replaySummary)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([type, count]) => (
              <span key={type} className="mr-2 text-muted-foreground">
                {EVENT_TYPE_LABELS[type] ?? type}: <span className="text-foreground">{count}</span>
              </span>
            ))}
        </div>
      )}
      {events.length > 1 && (
        <div className="flex items-center gap-2 border-b border-border bg-[var(--color-panel-surface)] px-3 py-1.5">
          <span className="cockpit-label shrink-0">Scrubber</span>
          <input
            type="range"
            min={0}
            max={cursorMax}
            value={cursorValue}
            onChange={(e) => {
              const next = Number(e.target.value)
              if (!sessionId) return
              setReplayCursor(sessionId, next === cursorMax ? null : next)
            }}
            aria-label="Timeline scrubber"
            data-testid="timeline-scrubber"
            className="flex-1 accent-[var(--color-cockpit-accent)]"
          />
          <span className="data-readout-dim text-[10px] tabular-nums shrink-0">
            {formatReplayCursor(replayCursor, events.length)}
          </span>
          {replayCursor !== null && (
            <button
              type="button"
              onClick={() => {
                if (!sessionId) return
                setReplayCursor(sessionId, null)
              }}
              className="cockpit-btn py-0.5 text-[9px]"
              data-testid="timeline-scrubber-reset"
            >
              Live
            </button>
          )}
        </div>
      )}
      {/* Filter bar */}
      <div className="flex flex-wrap gap-1 p-2 border-b border-border bg-[var(--color-panel-surface)]">
        <button
          onClick={() => setFilterType(null)}
          className={`px-2 py-0.5 text-[10px] [font-family:var(--font-mono-data)] uppercase tracking-wide transition-colors ${
            filterType === null
              ? 'border border-[color-mix(in_srgb,var(--color-cockpit-accent)_60%,transparent)] text-[var(--color-cockpit-accent)] bg-[color-mix(in_srgb,var(--color-cockpit-accent)_10%,transparent)]'
              : 'border border-border/60 text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          All
        </button>
        {ALL_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(filterType === t ? null : t)}
            className={`px-2 py-0.5 text-[10px] [font-family:var(--font-mono-data)] uppercase tracking-wide transition-colors ${
              filterType === t
                ? 'border border-[color-mix(in_srgb,var(--color-cockpit-accent)_60%,transparent)] text-[var(--color-cockpit-accent)] bg-[color-mix(in_srgb,var(--color-cockpit-accent)_10%,transparent)]'
                : 'border border-border/60 text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            {EVENT_TYPE_LABELS[t] ?? t}
          </button>
        ))}
      </div>

      {/* Jump-to controls */}
      <div className="flex gap-2 px-2 py-1.5 border-b border-border bg-[var(--color-panel-surface)]">
        <button
          onClick={() => jumpNext('approval_request')}
          disabled={!jumpTargets.some(({ e }) => e.type === 'approval_request')}
          className="cockpit-btn text-[9px] py-0.5 disabled:opacity-30"
        >
          Next Approval
        </button>
        <button
          onClick={() => jumpNext('file_change')}
          disabled={!jumpTargets.some(({ e }) => e.type === 'file_change')}
          className="cockpit-btn text-[9px] py-0.5 disabled:opacity-30"
        >
          Next File Change
        </button>
        <button
          onClick={() => jumpPrev('approval_request')}
          disabled={!jumpTargets.some(({ e }) => e.type === 'approval_request')}
          className="hidden"
        >
          Prev Approval
        </button>
        <button
          onClick={() => jumpPrev('file_change')}
          disabled={!jumpTargets.some(({ e }) => e.type === 'file_change')}
          className="hidden"
        >
          Prev File Change
        </button>
      </div>

      {/* Timeline list */}
      <div className="flex-1 overflow-y-auto" data-testid="timeline-list">
        {filteredEventsWithIdx.length === 0 && (
          <div className="flex items-center justify-center h-full cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }}>
            -- NO EVENTS --
          </div>
        )}
        {filteredEventsWithIdx.map(({ event, origIdx }) => {
          const rowKey = rowKeyFor(event, origIdx)
          const isSelected = selectedSeq === rowKey
          const relatedEvents = relatedEventsFor(replayEvents, event, origIdx)
          return (
            <div key={rowKey}>
              <div
                ref={(el) => {
                  if (el) rowRefs.current.set(origIdx, el)
                }}
                onClick={() => setSelectedSeq(isSelected ? null : rowKey)}
                className={`flex items-start gap-2 px-3 py-2 cursor-pointer border-b border-border/40 transition-colors ${
                  isSelected ? 'bg-[var(--color-panel-surface)] border-l-2 border-l-[color-mix(in_srgb,var(--color-cockpit-accent)_50%,transparent)]' : 'hover:bg-[var(--color-panel-surface)]/60'
                }`}
              >
                <span className="data-readout-dim text-[10px] w-16 shrink-0 tabular-nums">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
                <span className="[font-family:var(--font-mono-data)] text-[10px] uppercase tracking-wide text-foreground">
                  {EVENT_TYPE_LABELS[event.type] ?? event.type}
                </span>
              </div>
              {isSelected && (
                <InlineDetail
                  event={event}
                  relatedEvents={relatedEvents}
                  onJump={jumpToEvent}
                  sessionId={sessionId}
                  onJumpToPanel={handleJumpToPanel}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
