import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../store/index.js'
import { sendWsMessage } from '../../hooks/useSessionEvents.js'
import type { NormalizedEvent } from '@agentcockpit/shared'
import { EMPTY_EVENTS } from '../../store/eventsSlice.js'
import { formatReplayCursor, sliceEventsForReplay } from '../../lib/replay.js'
import { usePanelSessionId } from './sessionScope.js'

// ─── Slash commands ───────────────────────────────────────────────────────────

const SLASH_COMMANDS = [
  { cmd: 'clear', label: '/clear', description: 'Clear chat display' },
  { cmd: 'model', label: '/model', description: 'Show active model' },
] as const

type SlashCmd = typeof SLASH_COMMANDS[number]['cmd']

// ─── Type guards ──────────────────────────────────────────────────────────────

function isChatMessage(e: NormalizedEvent): e is NormalizedEvent & {
  type: 'session_chat_message'; role: 'user' | 'assistant' | 'system'; content: string
} { return e.type === 'session_chat_message' }

function isChatError(e: NormalizedEvent): e is NormalizedEvent & {
  type: 'session_chat_error'; reason: string
} { return e.type === 'session_chat_error' }

function isApprovalRequest(e: NormalizedEvent): e is NormalizedEvent & {
  type: 'approval_request'; approvalId: string; actionType: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  proposedAction: string; affectedPaths?: string[]; whyRisky?: string
} { return e.type === 'approval_request' }

function isApprovalResolved(e: NormalizedEvent): e is NormalizedEvent & {
  type: 'approval_resolved'; approvalId: string; decision: string
} { return e.type === 'approval_resolved' }

function isToolCall(e: NormalizedEvent): e is NormalizedEvent & {
  type: 'tool_call' | 'tool_called'; toolName: string; input: unknown
} { return e.type === 'tool_call' || e.type === 'tool_called' }

function isFileChange(e: NormalizedEvent): e is NormalizedEvent & {
  type: 'file_change'; filePath: string; changeType: 'created' | 'modified' | 'deleted'
} { return e.type === 'file_change' }

function isSubagentSpawn(e: NormalizedEvent): e is NormalizedEvent & {
  type: 'subagent_spawn'; subagentSessionId: string
} { return e.type === 'subagent_spawn' }

function isSubagentComplete(e: NormalizedEvent): e is NormalizedEvent & {
  type: 'subagent_complete'; subagentSessionId: string; success: boolean
} { return e.type === 'subagent_complete' }

function isSessionEnd(e: NormalizedEvent): e is NormalizedEvent & {
  type: 'session_end'
} { return e.type === 'session_end' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  low: 'var(--color-cockpit-dim)',
  medium: 'var(--color-cockpit-accent)',
  high: 'var(--color-cockpit-amber)',
  critical: 'var(--color-cockpit-red)',
}

function toolCallSummary(toolName: string, input: unknown): string {
  if (!input || typeof input !== 'object') return toolName
  const inp = input as Record<string, unknown>
  // Extract the most meaningful field per tool
  const key =
    inp['command'] ?? inp['cmd'] ??
    inp['file_path'] ?? inp['path'] ??
    inp['pattern'] ?? inp['query'] ??
    inp['url'] ?? inp['prompt'] ??
    inp['description'] ?? null
  if (typeof key === 'string') {
    const truncated = key.length > 80 ? key.slice(0, 80) + '…' : key
    return `${toolName}: ${truncated}`
  }
  return toolName
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ApprovalItemProps {
  approvalId: string; actionType: string
  riskLevel: string; proposedAction: string
  affectedPaths?: string[]; whyRisky?: string
  resolvedDecision?: string
  disabled?: boolean
  onDecide: (id: string, d: 'approve' | 'deny') => void
}

function ApprovalItem({ approvalId, actionType, riskLevel, proposedAction, affectedPaths, whyRisky, resolvedDecision, disabled, onDecide }: ApprovalItemProps) {
  const riskColor = RISK_COLORS[riskLevel] ?? 'var(--color-cockpit-dim)'
  let parsedAction: string
  try { parsedAction = JSON.stringify(JSON.parse(proposedAction), null, 2) }
  catch { parsedAction = proposedAction }

  return (
    <div className="border border-border bg-[oklch(0.20_0.02_250)] p-3 text-xs [font-family:var(--font-mono-data)] space-y-2"
      style={{ borderLeftColor: riskColor, borderLeftWidth: '3px' }}>
      <div className="flex items-center gap-2">
        <span style={{ color: riskColor }}>⚠</span>
        <span className="text-[var(--color-foreground)] font-bold tracking-wide">APPROVAL REQUIRED</span>
        <span className="ml-auto px-1.5 py-0.5 text-[10px] uppercase tracking-widest"
          style={{ color: riskColor, border: `1px solid ${riskColor}` }}>
          {riskLevel}
        </span>
      </div>
      <div style={{ color: 'var(--color-cockpit-dim)' }}>
        type: <span className="text-[var(--color-foreground)]">{actionType}</span>
      </div>
      {whyRisky && (
        <div style={{ color: 'var(--color-cockpit-dim)' }}>
          why: <span className="text-[var(--color-foreground)]">{whyRisky}</span>
        </div>
      )}
      <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[var(--color-foreground)] opacity-80">{parsedAction}</pre>
      {affectedPaths && affectedPaths.length > 0 && (
        <div style={{ color: 'var(--color-cockpit-dim)' }}>
          paths: {affectedPaths.map((p) => (
            <span key={p} className="mr-2 text-[var(--color-foreground)]">{p}</span>
          ))}
        </div>
      )}
      {resolvedDecision ? (
        <div className="text-xs font-bold tracking-widest uppercase" style={{
          color: resolvedDecision === 'approved' || resolvedDecision === 'always_allow'
            ? 'var(--color-cockpit-accent)' : 'var(--color-cockpit-red)',
        }}>
          {resolvedDecision === 'always_allow' ? 'ALWAYS ALLOW' : resolvedDecision.toUpperCase()}
        </div>
      ) : (
        <div className="flex gap-2 pt-1">
          <button disabled={disabled} onClick={() => onDecide(approvalId, 'approve')}
            className="px-3 py-1 text-xs border border-[var(--color-cockpit-accent)] text-[var(--color-cockpit-accent)] hover:bg-[var(--color-cockpit-accent)] hover:text-black transition-colors">
            Approve
          </button>
          <button disabled={disabled} onClick={() => onDecide(approvalId, 'deny')}
            className="px-3 py-1 text-xs border border-[var(--color-cockpit-red)] text-[var(--color-cockpit-red)] hover:bg-[var(--color-cockpit-red)] hover:text-black transition-colors">
            Deny
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ChatPanel() {
  const sessionId = usePanelSessionId()
  const session = useStore((s) => (sessionId ? s.sessions[sessionId] : undefined))
  const events = useStore((s) => (sessionId ? s.events[sessionId] : EMPTY_EVENTS) ?? EMPTY_EVENTS)
  const replayCursor = useStore((s) => (sessionId ? s.replayCursorBySession[sessionId] ?? null : null))
  const wsStatus = useStore((s) => s.wsStatus)

  const [message, setMessage] = useState('')
  const [awaitingReply, setAwaitingReply] = useState(false)
  const [lastSendAt, setLastSendAt] = useState<string | null>(null)
  const [localDecisions, setLocalDecisions] = useState<Record<string, 'approve' | 'deny'>>({})
  const [clearedAt, setClearedAt] = useState<string | null>(null)
  const [modelBanner, setModelBanner] = useState<string | null>(null)
  const [slashMenuIdx, setSlashMenuIdx] = useState(0)
  const replyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const modelBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const historyRef = useRef<HTMLDivElement | null>(null)
  const isReplayActive = replayCursor !== null

  const activeModel = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (e?.type === 'session_usage' && 'model' in e && typeof (e as Record<string, unknown>)['model'] === 'string') {
        return (e as Record<string, unknown>)['model'] as string
      }
    }
    return null
  }, [events])

  const slashQuery = message.startsWith('/') ? message.slice(1).toLowerCase() : null
  const slashMatches = slashQuery !== null
    ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(slashQuery))
    : []

  // All renderable events in chronological order
  const replayEvents = useMemo(() => sliceEventsForReplay(events, replayCursor), [events, replayCursor])
  const timelineItems = useMemo(() => {
    const raw = replayEvents.filter((e) =>
      isChatMessage(e) || isApprovalRequest(e) || isToolCall(e) ||
      isFileChange(e) || isSubagentSpawn(e) || isSubagentComplete(e) || isSessionEnd(e),
    )

    const merged: typeof raw = []
    for (const item of raw) {
      const prev = merged[merged.length - 1]
      if (
        prev &&
        isChatMessage(prev) &&
        prev.role === 'assistant' &&
        isChatMessage(item) &&
        item.role === 'assistant' &&
        prev.provider === item.provider
      ) {
        merged[merged.length - 1] = {
          ...prev,
          content: `${prev.content}${item.content}`,
          timestamp: item.timestamp,
        }
        continue
      }
      merged.push(item)
    }
    return merged
  }, [replayEvents])

  const visibleItems = clearedAt ? timelineItems.filter((i) => i.timestamp > clearedAt) : timelineItems

  // Map approvalId → resolved decision from server events
  const resolvedDecisions = useMemo(() => {
    const map: Record<string, string> = {}
    for (const e of replayEvents) {
      if (isApprovalResolved(e)) map[e.approvalId] = e.decision
    }
    return map
  }, [replayEvents])

  const latestError = useMemo(() => {
    for (let i = replayEvents.length - 1; i >= 0; i--) {
      const e = replayEvents[i]
      if (e && isChatError(e)) return e.reason
    }
    return undefined
  }, [replayEvents])

  const sendEnabledForSession = session?.canSendMessage === true && !isReplayActive
  const canSend = sendEnabledForSession && wsStatus === 'connected' && !awaitingReply
  const promptPlaceholder = isReplayActive ? 'Replay view' : canSend ? 'Type a message...' : 'Waiting for reply'

  useEffect(() => () => {
    if (replyTimeoutRef.current) { clearTimeout(replyTimeoutRef.current); replyTimeoutRef.current = null }
    if (modelBannerTimerRef.current) { clearTimeout(modelBannerTimerRef.current); modelBannerTimerRef.current = null }
  }, [])

  useEffect(() => {
    if (isReplayActive || !awaitingReply || !lastSendAt) return
    const resolved = events.some((e) => {
      if (e.timestamp < lastSendAt) return false
      if (isChatError(e)) return true
      return isChatMessage(e) && e.role === 'assistant'
    })
    if (!resolved) return
    setAwaitingReply(false)
    if (replyTimeoutRef.current) { clearTimeout(replyTimeoutRef.current); replyTimeoutRef.current = null }
  }, [awaitingReply, events, isReplayActive, lastSendAt])

  useEffect(() => {
    if (wsStatus === 'connected') return
    setAwaitingReply(false)
    if (replyTimeoutRef.current) { clearTimeout(replyTimeoutRef.current); replyTimeoutRef.current = null }
  }, [wsStatus])

  useLayoutEffect(() => {
    const el = composerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [message])

  useEffect(() => {
    const el = historyRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [timelineItems.length])

  // Scroll to bottom when the history container becomes visible (Radix Tabs.Content
  // hides inactive tabs with display:none; height goes 0→real when the tab activates).
  useEffect(() => {
    const el = historyRef.current
    if (!el) return
    let prevHeight = 0
    const observer = new ResizeObserver(() => {
      const h = el.clientHeight
      if (h > 0 && prevHeight === 0) {
        el.scrollTop = el.scrollHeight
      }
      prevHeight = h
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  function executeSlashCommand(cmd: SlashCmd): void {
    if (cmd === 'clear') {
      setClearedAt(new Date().toISOString())
    } else if (cmd === 'model') {
      const label = activeModel ?? 'unknown'
      setModelBanner(label)
      if (modelBannerTimerRef.current) clearTimeout(modelBannerTimerRef.current)
      modelBannerTimerRef.current = setTimeout(() => { setModelBanner(null); modelBannerTimerRef.current = null }, 4000)
    }
    setMessage('')
    setSlashMenuIdx(0)
  }

  function onSend(): void {
    const content = message.trim()
    if (!sessionId || !content || !canSend) return
    const sentAt = new Date().toISOString()
    setLastSendAt(sentAt)
    setAwaitingReply(true)
    if (replyTimeoutRef.current) { clearTimeout(replyTimeoutRef.current); replyTimeoutRef.current = null }
    replyTimeoutRef.current = setTimeout(() => {
      setAwaitingReply(false); replyTimeoutRef.current = null
    }, 45_000)
    sendWsMessage({ type: 'session_chat', sessionId, content })
    setMessage('')
  }

  function onApprovalDecide(approvalId: string, decision: 'approve' | 'deny'): void {
    setLocalDecisions((prev) => ({ ...prev, [approvalId]: decision }))
    sendWsMessage({ type: 'approval_decision', approvalId, decision })
  }

  if (!sessionId || !session) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p className="cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }}>-- NO SESSION SELECTED --</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col text-[var(--color-foreground)]">
      <div className="shrink-0 border-b border-border p-3">
        <h2 className="cockpit-label">Session Chat</h2>
        {isReplayActive && (
          <p className="mt-1 text-xs text-[var(--color-cockpit-amber)] [font-family:var(--font-mono-data)]">
            Replay view · {formatReplayCursor(replayCursor, events.length)} · chat send disabled
          </p>
        )}
        {!isReplayActive && awaitingReply && (
          <p className="mt-1 text-xs text-[var(--color-cockpit-accent)] [font-family:var(--font-mono-data)]">
            {session.provider === 'claude' ? 'Claude is typing...' : 'Codex is typing...'}
          </p>
        )}
        {latestError && <p className="mt-1 text-xs text-[var(--color-cockpit-red)]">{latestError}</p>}
      </div>

      <div ref={historyRef} className="flex-1 overflow-y-auto p-3 space-y-1" data-testid="chat-history">
        {visibleItems.length === 0 ? (
          <p className="cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }}>-- NO CHAT MESSAGES --</p>
        ) : (
          visibleItems.map((item, index) => {
            const key = `${item.timestamp}-${index}`

            if (isApprovalRequest(item)) {
              const localDecision = isReplayActive ? undefined : localDecisions[item.approvalId]
              const resolved = resolvedDecisions[item.approvalId]
                ?? (localDecision === 'approve' ? 'approved'
                  : localDecision === 'deny' ? 'denied'
                  : undefined)
              return (
                <ApprovalItem key={key}
                  approvalId={item.approvalId} actionType={item.actionType}
                  riskLevel={item.riskLevel} proposedAction={item.proposedAction}
                  affectedPaths={item.affectedPaths} whyRisky={item.whyRisky}
                  resolvedDecision={resolved} disabled={isReplayActive}
                  onDecide={onApprovalDecide} />
              )
            }

            if (isChatMessage(item)) {
              return (
                <div key={key} className="flex items-start gap-2 [font-family:var(--font-mono-data)] text-sm leading-relaxed">
                  {item.role === 'user' ? (
                    <span className="shrink-0 text-[var(--color-cockpit-accent)]" aria-hidden>&gt;</span>
                  ) : (
                    <span className={`shrink-0 text-base leading-none ${
                      item.provider === 'claude' ? 'text-[var(--color-cockpit-amber)]'
                      : item.provider === 'codex' ? 'text-[var(--color-cockpit-accent)]'
                      : 'text-[var(--color-cockpit-dim)]'
                    }`} aria-hidden>•</span>
                  )}
                  <p className="min-w-0 whitespace-pre-wrap break-words text-[var(--color-foreground)]">{item.content}</p>
                </div>
              )
            }

            if (isToolCall(item)) {
              return (
                <div key={key} className="flex items-center gap-2 [font-family:var(--font-mono-data)] text-xs py-0.5"
                  style={{ color: 'var(--color-cockpit-dim)' }}>
                  <span className="shrink-0" style={{ color: 'var(--color-cockpit-accent)' }}>→</span>
                  <span className="truncate">{toolCallSummary(item.toolName, item.input)}</span>
                </div>
              )
            }

            if (isFileChange(item)) {
              const icon = item.changeType === 'created' ? '+' : item.changeType === 'deleted' ? '-' : '~'
              const color = item.changeType === 'created' ? 'var(--color-cockpit-accent)'
                : item.changeType === 'deleted' ? 'var(--color-cockpit-red)'
                : 'var(--color-cockpit-amber)'
              return (
                <div key={key} className="flex items-center gap-2 [font-family:var(--font-mono-data)] text-xs py-0.5"
                  style={{ color: 'var(--color-cockpit-dim)' }}>
                  <span className="shrink-0 font-bold" style={{ color }}>{icon}</span>
                  <span className="truncate">{item.filePath}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider" style={{ color }}>
                    {item.changeType}
                  </span>
                </div>
              )
            }

            if (isSubagentSpawn(item)) {
              return (
                <div key={key} className="flex items-center gap-2 [font-family:var(--font-mono-data)] text-xs py-0.5"
                  style={{ color: 'var(--color-cockpit-dim)' }}>
                  <span className="shrink-0" style={{ color: 'var(--color-cockpit-accent)' }}>↳</span>
                  <span>subagent started</span>
                </div>
              )
            }

            if (isSubagentComplete(item)) {
              return (
                <div key={key} className="flex items-center gap-2 [font-family:var(--font-mono-data)] text-xs py-0.5"
                  style={{ color: 'var(--color-cockpit-dim)' }}>
                  <span className="shrink-0" style={{ color: item.success ? 'var(--color-cockpit-accent)' : 'var(--color-cockpit-red)' }}>↲</span>
                  <span>subagent {item.success ? 'done' : 'failed'}</span>
                </div>
              )
            }

            if (isSessionEnd(item)) {
              return (
                <div key={key} className="[font-family:var(--font-mono-data)] text-[10px] uppercase tracking-widest text-center py-1"
                  style={{ color: 'var(--color-cockpit-dim)' }}>
                  — session ended —
                </div>
              )
            }

            return null
          })
        )}
      </div>

      {sendEnabledForSession ? (
        <div className="shrink-0 border-t border-border p-3">
          {modelBanner && (
          <div className="mb-2 px-3 py-1.5 border border-[var(--color-cockpit-accent)] [font-family:var(--font-mono-data)] text-xs flex items-center gap-2"
            style={{ color: 'var(--color-cockpit-accent)' }}>
            <span style={{ color: 'var(--color-cockpit-dim)' }}>model:</span>
            {modelBanner}
          </div>
        )}
        <div className="relative border border-border bg-[oklch(0.23_0.02_250)] flex items-start">
          {slashMatches.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-px border border-[color-mix(in_srgb,var(--color-cockpit-accent)_40%,transparent)] bg-[var(--color-panel-surface)] z-10">
              {slashMatches.map((c, i) => (
                <button
                  key={c.cmd}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); executeSlashCommand(c.cmd) }}
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-3 [font-family:var(--font-mono-data)] text-xs transition-colors ${
                    i === slashMenuIdx
                      ? 'bg-[color-mix(in_srgb,var(--color-cockpit-accent)_15%,transparent)]'
                      : 'hover:bg-[color-mix(in_srgb,var(--color-cockpit-accent)_8%,transparent)]'
                  }`}
                >
                  <span style={{ color: 'var(--color-cockpit-accent)' }}>{c.label}</span>
                  <span style={{ color: 'var(--color-cockpit-dim)' }}>{c.description}</span>
                </button>
              ))}
            </div>
          )}
            <span className="pointer-events-none shrink-0 pt-[0.6rem] pl-3 text-sm text-[var(--color-cockpit-accent)] [font-family:var(--font-mono-data)]" aria-hidden>
              &gt;
            </span>
            <textarea
              ref={composerRef}
              rows={1}
              aria-label="Chat message"
              value={message}
              onChange={(e) => { setMessage(e.target.value); setSlashMenuIdx(0) }}
              onKeyDown={(e) => {
                if (slashMatches.length > 0) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSlashMenuIdx((i) => Math.min(i + 1, slashMatches.length - 1)); return }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setSlashMenuIdx((i) => Math.max(i - 1, 0)); return }
                  if (e.key === 'Escape') { e.preventDefault(); setMessage(''); return }
                  if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                    e.preventDefault()
                    const sel = slashMatches[slashMenuIdx]
                    if (sel) executeSlashCommand(sel.cmd)
                    return
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() }
              }}
              placeholder={promptPlaceholder}
              className="block w-full min-h-11 resize-none overflow-hidden border-0 bg-transparent py-2 pr-3 pl-2 text-sm text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-cockpit-dim)] [font-family:var(--font-mono-data)] caret-[var(--color-cockpit-accent)] disabled:cursor-not-allowed"
              disabled={wsStatus !== 'connected' || awaitingReply}
              style={{ lineHeight: '1.5rem' }}
            />
          </div>
          <p className="mt-1 text-[10px] text-[var(--color-cockpit-dim)] [font-family:var(--font-mono-data)]">
            Enter to send · Shift+Enter for newline · / for commands
          </p>
        </div>
      ) : (
        <div className="shrink-0 border-t border-border p-3">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {isReplayActive
              ? 'Replay mode is read-only.'
              : 'This session is approval-only and does not support chat sends.'}
          </p>
          {session.reason && <p className="text-xs mt-1 text-[var(--color-muted-foreground)]">{session.reason}</p>}
        </div>
      )}
    </div>
  )
}
