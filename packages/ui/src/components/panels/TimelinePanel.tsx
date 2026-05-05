import { useEffect, useMemo, useState } from 'react'
import type { NormalizedEvent } from '@agentcockpit/shared'
import { useStore } from '../../store/index.js'
import { EMPTY_EVENTS } from '../../store/eventsSlice.js'
import { DAEMON_URL } from '../../lib/daemonUrl.js'
import { usePanelSessionId } from './sessionScope.js'

// ─── Turn grouping ─────────────────────────────────────────────────────────────

interface TurnGroup {
  id: string
  startTime: string
  endTime: string
  events: NormalizedEvent[]
  toolCalls: number
  filesChanged: number
  approvals: number
  userPrompt?: string
  assistantSummary?: string
  isSessionBoundary: boolean
}

const TWO_MINUTES_MS = 2 * 60 * 1000

function groupIntoTurns(events: NormalizedEvent[]): TurnGroup[] {
  if (events.length === 0) return []

  const turns: TurnGroup[] = []
  let currentEvents: NormalizedEvent[] = []

  function flushTurn() {
    if (currentEvents.length === 0) return
    const first = currentEvents[0]!
    const last = currentEvents[currentEvents.length - 1]!
    const toolCalls = currentEvents.filter((e) => e.type === 'tool_call').length
    const filesChanged = currentEvents.filter((e) => e.type === 'file_change').length
    const approvals = currentEvents.filter((e) => e.type === 'approval_request').length
    const userMsg = currentEvents.find(
      (e) => e.type === 'session_chat_message' && (e as { role: string }).role === 'user',
    )
    const assistantMsg = [...currentEvents]
      .reverse()
      .find((e) => e.type === 'session_chat_message' && (e as { role: string }).role === 'assistant')
    const isBoundary = first.type === 'session_start' || first.type === 'session_end'

    turns.push({
      id: `turn-${turns.length}`,
      startTime: first.timestamp,
      endTime: last.timestamp,
      events: [...currentEvents],
      toolCalls,
      filesChanged,
      approvals,
      userPrompt:
        userMsg?.type === 'session_chat_message'
          ? (userMsg as { content: string }).content.slice(0, 120)
          : undefined,
      assistantSummary:
        assistantMsg?.type === 'session_chat_message'
          ? (assistantMsg as { content: string }).content.slice(0, 120)
          : undefined,
      isSessionBoundary: isBoundary,
    })
    currentEvents = []
  }

  for (const event of events) {
    // Session boundaries always start a new turn
    if (event.type === 'session_start' || event.type === 'session_end') {
      flushTurn()
      currentEvents.push(event)
      flushTurn()
      continue
    }

    // User message starts a new turn
    if (event.type === 'session_chat_message' && (event as { role: string }).role === 'user') {
      flushTurn()
      currentEvents.push(event)
      continue
    }

    // Time gap > 2 min starts a new turn
    const prev = currentEvents[currentEvents.length - 1]
    if (prev) {
      const gap = new Date(event.timestamp).getTime() - new Date(prev.timestamp).getTime()
      if (gap > TWO_MINUTES_MS) {
        flushTurn()
      }
    }

    currentEvents.push(event)
  }

  flushTurn()
  return turns
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString()
}

function formatElapsed(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (ms < 1000) return '<1s'
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

// ─── Event detail (expanded within a turn) ────────────────────────────────────

const EVENT_TYPE_LABELS: Record<string, string> = {
  session_start: 'Session Started',
  session_end: 'Session Ended',
  tool_call: 'Tool Call',
  file_change: 'File Change',
  approval_request: 'Approval Requested',
  approval_resolved: 'Approval Resolved',
  subagent_spawn: 'Subagent Spawned',
  subagent_complete: 'Subagent Done',
  memory_read: 'Memory Read',
  memory_write: 'Memory Write',
  provider_parse_error: 'Parse Error',
  session_chat_message: 'Chat',
  session_chat_error: 'Chat Error',
  session_usage: 'Usage',
}

function eventAccentColor(type: string): string {
  switch (type) {
    case 'approval_request': return 'var(--color-cockpit-amber)'
    case 'approval_resolved': return 'var(--color-cockpit-green)'
    case 'file_change': return 'var(--color-cockpit-cyan)'
    case 'provider_parse_error':
    case 'session_chat_error': return 'var(--color-cockpit-red)'
    case 'session_start':
    case 'session_end': return 'var(--color-cockpit-dim)'
    default: return 'var(--color-cockpit-accent)'
  }
}

function EventRow({ event }: { event: NormalizedEvent }) {
  const [expanded, setExpanded] = useState(false)
  const label = EVENT_TYPE_LABELS[event.type] ?? event.type
  const color = eventAccentColor(event.type)

  let detail = ''
  if (event.type === 'tool_call') detail = event.toolName
  else if (event.type === 'file_change') detail = `${event.changeType.toUpperCase()} ${event.filePath.split('/').pop() ?? event.filePath}`
  else if (event.type === 'approval_request') detail = `${event.actionType} (${event.riskLevel})`
  else if (event.type === 'approval_resolved') detail = event.decision
  else if (event.type === 'session_chat_message') detail = `${(event as { role: string }).role}: ${(event as { content: string }).content.slice(0, 60)}…`
  else if (event.type === 'memory_read') detail = (event as { memoryKey: string }).memoryKey
  else if (event.type === 'memory_write') detail = (event as { memoryKey: string }).memoryKey
  else if (event.type === 'session_usage') {
    const e = event as { inputTokens: number; outputTokens: number }
    detail = `in ${e.inputTokens} · out ${e.outputTokens}`
  }

  return (
    <div>
      <div
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 pl-8 pr-3 py-1 cursor-pointer hover:bg-muted/20 border-b border-border/20"
      >
        <span className="text-[9px] data-readout-dim w-14 shrink-0 tabular-nums">
          {formatTime(event.timestamp)}
        </span>
        <span className="[font-family:var(--font-mono-data)] text-[9px] uppercase tracking-wide shrink-0" style={{ color, minWidth: '80px' }}>
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground truncate [font-family:var(--font-mono-data)]">
          {detail}
        </span>
      </div>
      {expanded && (
        <div className="pl-8 pr-3 py-2 bg-[var(--color-panel-surface)] border-b border-border/30 text-[10px] text-muted-foreground [font-family:var(--font-mono-data)]">
          <pre className="whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
            {JSON.stringify(event, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ─── Turn card ─────────────────────────────────────────────────────────────────

function TurnCard({ turn, turnNumber }: { turn: TurnGroup; turnNumber: number }) {
  const [expanded, setExpanded] = useState(false)

  const borderColor = turn.approvals > 0
    ? 'var(--color-cockpit-amber)'
    : turn.filesChanged > 0
      ? 'var(--color-cockpit-cyan)'
      : 'var(--color-border)'

  if (turn.isSessionBoundary) {
    const isStar = turn.events[0]?.type === 'session_start'
    return (
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/40">
        <span className="[font-family:var(--font-mono-data)] text-[10px] uppercase tracking-wide"
              style={{ color: isStar ? 'var(--color-cockpit-green)' : 'var(--color-cockpit-dim)' }}>
          {isStar ? '▶ Session Started' : '■ Session Ended'}
        </span>
        <span className="data-readout-dim text-[10px] tabular-nums">{formatTime(turn.startTime)}</span>
      </div>
    )
  }

  return (
    <div className="border-b border-border/40">
      {/* Turn header */}
      <div
        onClick={() => setExpanded((v) => !v)}
        className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/10 transition-colors border-l-2"
        style={{ borderLeftColor: expanded ? borderColor : 'transparent' }}
      >
        <span className="data-readout-dim text-[9px] tabular-nums w-8 shrink-0 pt-0.5">
          #{String(turnNumber).padStart(2, '0')}
        </span>

        <div className="flex-1 min-w-0">
          {/* User prompt preview */}
          {turn.userPrompt && (
            <p className="text-[11px] text-foreground [font-family:var(--font-mono-data)] truncate mb-1">
              {turn.userPrompt}
            </p>
          )}
          {!turn.userPrompt && turn.toolCalls > 0 && (
            <p className="text-[11px] text-foreground [font-family:var(--font-mono-data)] mb-1">
              {turn.toolCalls} tool{turn.toolCalls > 1 ? 's' : ''} executed
            </p>
          )}

          {/* Stat chips */}
          <div className="flex flex-wrap gap-1.5 mt-1">
            {turn.toolCalls > 0 && (
              <span className="[font-family:var(--font-mono-data)] text-[9px] uppercase px-1 py-0.5 border"
                    style={{ color: 'var(--color-cockpit-accent)', borderColor: 'color-mix(in srgb, var(--color-cockpit-accent) 40%, transparent)' }}>
                {turn.toolCalls} tools
              </span>
            )}
            {turn.filesChanged > 0 && (
              <span className="[font-family:var(--font-mono-data)] text-[9px] uppercase px-1 py-0.5 border"
                    style={{ color: 'var(--color-cockpit-cyan)', borderColor: 'color-mix(in srgb, var(--color-cockpit-cyan) 40%, transparent)' }}>
                {turn.filesChanged} files
              </span>
            )}
            {turn.approvals > 0 && (
              <span className="[font-family:var(--font-mono-data)] text-[9px] uppercase px-1 py-0.5 border"
                    style={{ color: 'var(--color-cockpit-amber)', borderColor: 'color-mix(in srgb, var(--color-cockpit-amber) 40%, transparent)' }}>
                {turn.approvals} approval{turn.approvals > 1 ? 's' : ''}
              </span>
            )}
            <span className="data-readout-dim text-[9px] tabular-nums">
              {formatTime(turn.startTime)}
              {turn.startTime !== turn.endTime && ` — ${formatElapsed(turn.startTime, turn.endTime)}`}
            </span>
          </div>
        </div>

        <span className="data-readout-dim text-[10px] shrink-0 pt-0.5 transition-transform"
              style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}>
          ▶
        </span>
      </div>

      {/* Expanded events */}
      {expanded && (
        <div className="bg-[var(--color-panel-surface)]/30">
          {turn.events.map((event, i) => (
            <EventRow key={`${turn.id}-${i}`} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TimelinePanel() {
  const sessionId = usePanelSessionId()
  const events = useStore((s) => s.events[sessionId!] ?? EMPTY_EVENTS)
  const bulkApplyEvents = useStore((s) => s.bulkApplyEvents)
  const [viewMode, setViewMode] = useState<'turns' | 'raw'>('turns')

  useEffect(() => {
    if (!sessionId) return
    if (events.length > 0) return
    fetch(`${DAEMON_URL}/api/sessions/${sessionId}/events`)
      .then((r) => r.json())
      .then((evs: NormalizedEvent[]) => bulkApplyEvents(sessionId, evs))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const turns = useMemo(() => groupIntoTurns(events), [events])

  // Reverse for newest-first in raw mode, keep chronological for turns
  const rawEventsReversed = useMemo(() => [...events].reverse(), [events])

  let turnCounter = 0

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 p-2 border-b border-border bg-[var(--color-panel-surface)]">
        <button
          onClick={() => setViewMode('turns')}
          className={`px-2 py-0.5 text-[10px] [font-family:var(--font-mono-data)] uppercase tracking-wide transition-colors ${
            viewMode === 'turns'
              ? 'border border-[color-mix(in_srgb,var(--color-cockpit-accent)_60%,transparent)] text-[var(--color-cockpit-accent)] bg-[color-mix(in_srgb,var(--color-cockpit-accent)_10%,transparent)]'
              : 'border border-border/60 text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          Turns
        </button>
        <button
          onClick={() => setViewMode('raw')}
          className={`px-2 py-0.5 text-[10px] [font-family:var(--font-mono-data)] uppercase tracking-wide transition-colors ${
            viewMode === 'raw'
              ? 'border border-[color-mix(in_srgb,var(--color-cockpit-accent)_60%,transparent)] text-[var(--color-cockpit-accent)] bg-[color-mix(in_srgb,var(--color-cockpit-accent)_10%,transparent)]'
              : 'border border-border/60 text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          Raw Events
        </button>
        <span className="data-readout-dim text-[10px] tabular-nums ml-auto">
          {events.length} events · {turns.filter((t) => !t.isSessionBoundary).length} turns
        </span>
      </div>

      <div className="flex-1 overflow-y-auto" data-testid="timeline-list">
        {events.length === 0 && (
          <div className="flex items-center justify-center h-full cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }}>
            -- NO EVENTS --
          </div>
        )}

        {viewMode === 'turns' && turns.map((turn) => {
          if (!turn.isSessionBoundary) turnCounter++
          return (
            <TurnCard
              key={turn.id}
              turn={turn}
              turnNumber={turn.isSessionBoundary ? 0 : turnCounter}
            />
          )
        })}

        {viewMode === 'raw' && rawEventsReversed.map((event, i) => (
          <EventRow key={`raw-${i}`} event={event} />
        ))}
      </div>
    </div>
  )
}
