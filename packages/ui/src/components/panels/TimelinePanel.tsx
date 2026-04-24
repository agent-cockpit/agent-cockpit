import { useEffect, useMemo, useRef, useState } from 'react'
import type { NormalizedEvent } from '@agentcockpit/shared'
import { useStore } from '../../store/index.js'
import { EMPTY_EVENTS } from '../../store/eventsSlice.js'
import { DAEMON_URL } from '../../lib/daemonUrl.js'
import { usePanelSessionId } from './sessionScope.js'

const EVENT_TYPE_LABELS: Record<string, string> = {
  session_start: 'Session Started',
  session_end: 'Session Ended',
  tool_call: 'Tool Call',
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="[font-family:var(--font-mono-data)]">
      <span className="cockpit-label">{label}:&nbsp;</span>
      <span className="text-muted-foreground">{value}</span>
    </div>
  )
}

function InlineDetail({ event }: { event: NormalizedEvent }) {
  const base = 'px-4 py-2 bg-[var(--color-panel-surface)] text-xs border-b border-border/50 text-muted-foreground'

  if (event.type === 'tool_call') {
    return (
      <div className={base}>
        <div className="[font-family:var(--font-mono-data)] font-medium text-[var(--color-cockpit-accent)]">{event.toolName}</div>
        <pre className="mt-1 whitespace-pre-wrap text-muted-foreground [font-family:var(--font-mono-data)]">
          {JSON.stringify(event.input, null, 2)}
        </pre>
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
      </div>
    )
  }

  if (event.type === 'approval_resolved') {
    return (
      <div className={base}>
        <Field label="Decision" value={event.decision} />
        <Field label="ID" value={event.approvalId.slice(0, 8)} />
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

  return null
}

export function TimelinePanel() {
  const sessionId = usePanelSessionId()
  const events = useStore((s) => s.events[sessionId!] ?? EMPTY_EVENTS)
  const bulkApplyEvents = useStore((s) => s.bulkApplyEvents)

  const [filterType, setFilterType] = useState<string | null>(null)
  const [selectedSeq, setSelectedSeq] = useState<number | string | null>(null)
  const [jumpIndex, setJumpIndex] = useState<number>(0)
  const rowRefs = useRef<Map<number, HTMLElement>>(new Map())

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
  const filteredEventsWithIdx = useMemo(() => {
    const indexed = events.map((e, i) => ({ event: e, origIdx: i }))
    const filtered = filterType ? indexed.filter(({ event }) => event.type === filterType) : indexed
    return filtered.slice().reverse()
  }, [events, filterType])

  // Jump-to targets always from UNFILTERED list
  const jumpTargets = events
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

  const ALL_TYPES = [...new Set(events.map((e) => e.type))]

  return (
    <div className="flex flex-col h-full overflow-hidden">
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
          const rowKey = (event as EventWithSeq).sequenceNumber ?? `idx-${origIdx}`
          const isSelected = selectedSeq === rowKey
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
              {isSelected && <InlineDetail event={event} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
