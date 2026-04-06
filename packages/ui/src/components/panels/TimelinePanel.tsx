import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import type { NormalizedEvent } from '@cockpit/shared'
import { useStore } from '../../store/index.js'
import { EMPTY_EVENTS } from '../../store/eventsSlice.js'

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
}

type EventWithSeq = NormalizedEvent & { sequenceNumber?: number }

function InlineDetail({ event }: { event: NormalizedEvent }) {
  if (event.type === 'tool_call') {
    return (
      <div className="px-4 py-2 bg-muted/30 text-xs border-b border-border">
        <div className="font-mono font-medium">{event.toolName}</div>
        <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">
          {JSON.stringify(event.input, null, 2)}
        </pre>
      </div>
    )
  }
  if (event.type === 'file_change') {
    return (
      <div className="px-4 py-2 bg-muted/30 text-xs border-b border-border">
        <div className="font-mono">
          {event.filePath}{' '}
          <span className="text-muted-foreground">({event.changeType})</span>
        </div>
        {event.diff && (
          <pre className="mt-1 whitespace-pre text-muted-foreground overflow-x-auto">{event.diff}</pre>
        )}
      </div>
    )
  }
  if (event.type === 'approval_request') {
    return (
      <div className="px-4 py-2 bg-muted/30 text-xs border-b border-border">
        <div>
          <span className="font-medium">Action:</span> {event.proposedAction}
        </div>
        <div>
          <span className="font-medium">Risk:</span> {event.riskLevel}
        </div>
        {event.whyRisky && (
          <div>
            <span className="font-medium">Why risky:</span> {event.whyRisky}
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="px-4 py-2 bg-muted/30 text-xs border-b border-border">
      <pre className="whitespace-pre-wrap">{JSON.stringify(event, null, 2)}</pre>
    </div>
  )
}

export function TimelinePanel() {
  const { sessionId } = useParams<{ sessionId: string }>()
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
    fetch(`http://localhost:3001/api/sessions/${sessionId}/events`)
      .then((r) => r.json())
      .then((evs: NormalizedEvent[]) => bulkApplyEvents(sessionId, evs))
      .catch(() => {
        /* silently ignore */
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]) // intentionally omit events/bulkApplyEvents — run once on mount

  const filteredEvents = filterType ? events.filter((e) => e.type === filterType) : events

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
      // If no "next", jump to the first one
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
      <div className="flex flex-wrap gap-1 p-2 border-b border-border">
        <button
          onClick={() => setFilterType(null)}
          className={`px-2 py-0.5 rounded text-xs ${filterType === null ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
        >
          All
        </button>
        {ALL_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(filterType === t ? null : t)}
            className={`px-2 py-0.5 rounded text-xs ${filterType === t ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
          >
            {EVENT_TYPE_LABELS[t] ?? t}
          </button>
        ))}
      </div>

      {/* Jump-to controls */}
      <div className="flex gap-2 px-2 py-1 border-b border-border text-xs">
        <button
          onClick={() => jumpNext('approval_request')}
          disabled={!jumpTargets.some(({ e }) => e.type === 'approval_request')}
        >
          Next Approval
        </button>
        <button
          onClick={() => jumpNext('file_change')}
          disabled={!jumpTargets.some(({ e }) => e.type === 'file_change')}
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
        {filteredEvents.length === 0 && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            No events
          </div>
        )}
        {filteredEvents.map((event, idx) => {
          const seq =
            (event as EventWithSeq).sequenceNumber !== undefined
              ? (event as EventWithSeq).sequenceNumber!
              : idx
          const rowKey = (event as EventWithSeq).sequenceNumber ?? `idx-${idx}`
          const isSelected = selectedSeq === rowKey
          return (
            <div key={rowKey}>
              <div
                ref={(el) => {
                  if (el) rowRefs.current.set(idx, el)
                }}
                onClick={() => setSelectedSeq(isSelected ? null : rowKey)}
                className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 border-b border-border/50"
              >
                <span className="text-xs text-muted-foreground w-16 shrink-0 font-mono">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
                <span className="text-xs font-medium">
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
