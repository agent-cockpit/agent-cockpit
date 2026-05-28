import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import { useStore } from '../../store/index.js'
import type { PopupTabId, SnapZone } from '../../store/index.js'
import { sendWsMessage } from '../../hooks/useSessionEvents.js'
import { ApprovalInbox } from '../panels/ApprovalInbox.js'
import { ChatPanel } from '../panels/ChatPanel.js'
import { TerminalPanel } from '../panels/TerminalPanel.js'
import { TimelinePanel } from '../panels/TimelinePanel.js'
import { DiffPanel } from '../panels/DiffPanel.js'
import { MemoryPanel } from '../panels/MemoryPanel.js'
import { ArtifactsPanel } from '../panels/ArtifactsPanel.js'
import { SessionScopeProvider } from '../panels/sessionScope.js'
import { getProviderAccentStyle } from '../providerAccent.js'
import { TerminateSessionDialog } from '../sessions/TerminateSessionDialog.js'
import { characterFaceUrl, type CharacterType } from './characterMapping.js'

interface Props {
  open: boolean
  onClose: () => void
  sessionId?: string | null
  inline?: boolean
  preferredTab?: PopupTabId | null
  onPreferredTabConsumed?: () => void
  onMinimize?: () => void
  onFocus?: () => void
  onSnapLayout?: (zone: SnapZone) => void
}

const SNAP_ZONE_LAYOUT: SnapZone[] = ['left', 'right', 'maximize', 'topleft', 'topright', 'bottomright']

const SNAP_ZONE_LABELS: Record<SnapZone, string> = {
  left: 'Left', right: 'Right', maximize: 'Max',
  topleft: '↖', topright: '↗', bottomleft: '↙', bottomright: '↘',
}

type SnapFill = { left: string; top: string; width: string; height: string }

const SNAP_ZONE_FILL: Record<SnapZone, SnapFill> = {
  left:        { left: '0',   top: '0',   width: '50%',  height: '100%' },
  right:       { left: '50%', top: '0',   width: '50%',  height: '100%' },
  maximize:    { left: '0',   top: '0',   width: '100%', height: '100%' },
  topleft:     { left: '0',   top: '0',   width: '50%',  height: '50%'  },
  topright:    { left: '50%', top: '0',   width: '50%',  height: '50%'  },
  bottomleft:  { left: '0',   top: '50%', width: '50%',  height: '50%'  },
  bottomright: { left: '50%', top: '50%', width: '50%',  height: '50%'  },
}

function SnapZonePreview({ zone }: { zone: SnapZone }) {
  return (
    <div className="absolute inset-1.5 border border-border/30 overflow-hidden">
      <div
        className="absolute"
        style={{
          ...SNAP_ZONE_FILL[zone],
          background: 'var(--color-cockpit-cyan)',
          opacity: 0.45,
        }}
      />
    </div>
  )
}

const TAB_IDS = ['approvals', 'chat', 'timeline', 'diff', 'memory', 'artifacts'] as const
type TabId = typeof TAB_IDS[number]

const TAB_LABELS: Record<TabId, string> = {
  approvals: 'Approvals',
  chat: 'Chat',
  timeline: 'Timeline',
  diff: 'Diff',
  memory: 'Memory',
  artifacts: 'Artifacts',
}

const STATUS_STYLES: Record<
  'active' | 'ended' | 'error',
  {
    label: string
    textClass: string
    dotClass: string
    borderClass: string
    bgClass: string
  }
> = {
  active: {
    label: 'coding',
    textClass: 'text-[var(--color-cockpit-green)]',
    dotClass: 'bg-[var(--color-cockpit-green)]',
    borderClass: 'border-[color-mix(in_srgb,var(--color-cockpit-green)_55%,transparent)]',
    bgClass: 'bg-[color-mix(in_srgb,var(--color-cockpit-green)_12%,transparent)]',
  },
  ended: {
    label: 'ended',
    textClass: 'text-[var(--color-cockpit-dim)]',
    dotClass: 'bg-[var(--color-cockpit-dim)]',
    borderClass: 'border-[color-mix(in_srgb,var(--color-cockpit-dim)_55%,transparent)]',
    bgClass: 'bg-[color-mix(in_srgb,var(--color-cockpit-dim)_16%,transparent)]',
  },
  error: {
    label: 'error',
    textClass: 'text-[var(--color-cockpit-red)]',
    dotClass: 'bg-[var(--color-cockpit-red)]',
    borderClass: 'border-[color-mix(in_srgb,var(--color-cockpit-red)_55%,transparent)]',
    bgClass: 'bg-[color-mix(in_srgb,var(--color-cockpit-red)_16%,transparent)]',
  },
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
  }
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

interface SessionUsageMetrics {
  inputTokens: number | null
  outputTokens: number | null
  contextPercent: number | null
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function readFirstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toFiniteNumber(record[key])
    if (value !== null) return value
  }
  return null
}

function extractUsageMetricsFromEvent(event: unknown): SessionUsageMetrics & { hasUsage: boolean } {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return { inputTokens: null, outputTokens: null, contextPercent: null, hasUsage: false }
  }

  const root = event as Record<string, unknown>
  const isUsageEvent = root['type'] === 'session_usage'
  const usageRecords: Record<string, unknown>[] = [root]
  const candidates = [
    root['usage'],
    root['tokenUsage'],
    root['metrics'],
    root['stats'],
    root['result'],
    root['output'],
  ]
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    usageRecords.push(candidate as Record<string, unknown>)
  }

  let inputTokens: number | null = null
  let outputTokens: number | null = null
  let contextPercent: number | null = null
  let hasUsage = false

  for (const record of usageRecords) {
    const beforeInput: number | null = inputTokens
    const beforeOutput: number | null = outputTokens
    const beforeContext: number | null = contextPercent
    if (inputTokens === null) {
      inputTokens = readFirstNumber(record, [
        'inputTokens',
        'input_tokens',
        'promptTokens',
        'prompt_tokens',
        'tokensIn',
        'inTokens',
      ])
    }
    if (outputTokens === null) {
      outputTokens = readFirstNumber(record, [
        'outputTokens',
        'output_tokens',
        'completionTokens',
        'completion_tokens',
        'tokensOut',
        'outTokens',
      ])
    }
    if (contextPercent === null) {
      contextPercent = readFirstNumber(record, [
        'contextPercent',
        'context_percent',
        'contextUsagePercent',
        'context_usage_percent',
        'ctxPercent',
        'ctx_percent',
      ])
    }

    if (contextPercent === null) {
      const used = readFirstNumber(record, [
        'contextUsedTokens',
        'context_used_tokens',
        'contextUsed',
        'context_used',
      ])
      const total = readFirstNumber(record, [
        'contextWindowTokens',
        'context_window_tokens',
        'contextWindow',
        'context_window',
        'maxContextTokens',
        'max_context_tokens',
      ])
      if (used !== null && total !== null && total > 0) {
        contextPercent = (used / total) * 100
      }
    }

    if (inputTokens === null || outputTokens === null) {
      const totalTokens = readFirstNumber(record, ['totalTokens', 'total_tokens'])
      if (totalTokens !== null) {
        if (inputTokens === null && outputTokens !== null) {
          inputTokens = Math.max(0, totalTokens - outputTokens)
        } else if (outputTokens === null && inputTokens !== null) {
          outputTokens = Math.max(0, totalTokens - inputTokens)
        }
      }
    }

    if (beforeInput !== inputTokens || beforeOutput !== outputTokens || beforeContext !== contextPercent) {
      hasUsage = true
    }
  }

  return { inputTokens, outputTokens, contextPercent, hasUsage: hasUsage || isUsageEvent }
}

function deriveUsageMetricsFromEvents(
  events: ReadonlyArray<unknown>,
): SessionUsageMetrics {
  let latestInputTokens: number | null = null
  let latestOutputTokens: number | null = null
  let latestContextPercent: number | null = null
  let hasUsage = false

  for (const event of events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) continue
    const record = event as Record<string, unknown>

    const usage = extractUsageMetricsFromEvent(record)
    if (!usage.hasUsage) continue
    hasUsage = true
    if (usage.inputTokens !== null) latestInputTokens = usage.inputTokens
    if (usage.outputTokens !== null) latestOutputTokens = usage.outputTokens
    if (usage.contextPercent !== null) latestContextPercent = usage.contextPercent
  }

  if (!hasUsage) {
    return { inputTokens: null, outputTokens: null, contextPercent: null }
  }

  const inputTokens = latestInputTokens
  const outputTokens = latestOutputTokens
  const contextPercent = latestContextPercent
  const normalizedContextPercent =
    contextPercent === null
      ? null
      : Math.max(0, Math.min(100, Math.round(contextPercent)))

  return { inputTokens, outputTokens, contextPercent: normalizedContextPercent }
}

function formatTokenCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--'
  const whole = Math.max(0, Math.round(value))
  if (whole < 1_000) return String(whole)
  if (whole < 10_000) return `${(whole / 1_000).toFixed(1)}K`
  if (whole < 1_000_000) return `${Math.round(whole / 1_000)}K`
  return `${(whole / 1_000_000).toFixed(1)}M`
}

export function InstancePopupHub({
  open,
  onClose,
  sessionId,
  inline = false,
  preferredTab,
  onPreferredTabConsumed,
  onMinimize,
  onFocus,
  onSnapLayout,
}: Props) {
  const wsUnavailableReason = 'Daemon connection is not open. Reconnect and try again.'
  const selectedSessionId = useStore((s) => s.selectedSessionId)
  const popupPreferredTab = useStore((s) => s.popupPreferredTab)
  const setPopupPreferredTab = useStore((s) => s.setPopupPreferredTab)
  const wsStatus = useStore((s) => s.wsStatus)

  const effectiveSessionId = sessionId ?? selectedSessionId
  const liveSession = useStore((s) =>
    effectiveSessionId ? s.sessions[effectiveSessionId] : undefined
  )
  const historySession = useStore((s) =>
    effectiveSessionId ? s.historySessions?.[effectiveSessionId] : undefined
  )
  const sessionEvents = useStore((s) =>
    effectiveSessionId ? (s.events[effectiveSessionId] ?? []) : []
  )

  const [activeTab, setActiveTab] = useState<TabId>('approvals')
  const [isTerminating, setIsTerminating] = useState(false)
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false)
  const [pickerAnchor, setPickerAnchor] = useState<{ right: number; top: number } | null>(null)
  const snapBtnRef = useRef<HTMLDivElement>(null)
  const layoutPickerRef = useRef<HTMLDivElement>(null)
  const [terminateError, setTerminateError] = useState<string | null>(null)
  const [confirmTerminateOpen, setConfirmTerminateOpen] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false)
  const wasOpenRef = useRef(false)

  const provider = (liveSession?.provider ?? historySession?.provider) as
    | 'claude'
    | 'codex'
    | undefined
  const character: CharacterType = liveSession?.character ?? 'astronaut'
  const workspacePath = liveSession?.workspacePath ?? historySession?.workspacePath
  const projectName = workspacePath?.split(/[/\\]/).at(-1) ?? 'Session'
  const pendingApprovals = liveSession?.pendingApprovals ?? 0
  const statusKey = (liveSession?.status ?? historySession?.finalStatus ?? 'ended') as
    | 'active'
    | 'ended'
    | 'error'
  const statusStyle = STATUS_STYLES[statusKey]
  const startedAtRaw = liveSession?.startedAt ?? historySession?.startedAt
  const endedAtRaw =
    liveSession?.status === 'active'
      ? null
      : liveSession?.lastEventAt ?? historySession?.endedAt ?? null
  const startedAtMs =
    startedAtRaw === undefined || startedAtRaw === null
      ? null
      : new Date(startedAtRaw).getTime()
  const endedAtMs =
    endedAtRaw === undefined || endedAtRaw === null
      ? null
      : new Date(endedAtRaw).getTime()
  const elapsedLabel =
    startedAtMs === null || Number.isNaN(startedAtMs)
      ? null
      : formatElapsed((endedAtMs ?? nowMs) - startedAtMs)
  const usageMetrics = useMemo(
    () => deriveUsageMetricsFromEvents(sessionEvents),
    [sessionEvents],
  )

  useEffect(() => {
    setAvatarLoadFailed(false)
  }, [character])

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    if (wasOpenRef.current) return

    const requestedTab = preferredTab ?? popupPreferredTab
    if (requestedTab && TAB_IDS.includes(requestedTab as TabId)) {
      setActiveTab(requestedTab as TabId)
      if (preferredTab !== undefined && preferredTab !== null) {
        onPreferredTabConsumed?.()
      } else if (popupPreferredTab) {
        setPopupPreferredTab(null)
      }
    } else {
      setActiveTab(liveSession?.mode === 'pty' ? 'chat' : 'approvals')
    }

    wasOpenRef.current = true
  }, [
    open,
    preferredTab,
    popupPreferredTab,
    onPreferredTabConsumed,
    setPopupPreferredTab,
  ])

  useEffect(() => {
    if (!open) {
      setIsTerminating(false)
      setTerminateError(null)
      setConfirmTerminateOpen(false)
      return
    }
    setIsTerminating(false)
    setTerminateError(null)
    setConfirmTerminateOpen(false)
  }, [open, effectiveSessionId])

  useEffect(() => {
    if (!isTerminating || !liveSession) return
    if (liveSession.status !== 'active') {
      setIsTerminating(false)
      return
    }
    if (liveSession.reason) {
      setTerminateError(liveSession.reason)
      setIsTerminating(false)
    }
  }, [isTerminating, liveSession])

  useEffect(() => {
    if (!open) return
    const timer = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [open])

  useEffect(() => {
    if (!layoutPickerOpen) return
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        !snapBtnRef.current?.contains(target) &&
        !layoutPickerRef.current?.contains(target)
      ) {
        setLayoutPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [layoutPickerOpen])

  function handleTerminate(): void {
    if (!liveSession || !effectiveSessionId) return
    if (liveSession.canTerminateSession !== true) {
      setTerminateError(
        liveSession.reason ?? 'Session termination is unavailable for this session.',
      )
      return
    }
    if (wsStatus !== 'connected') {
      setTerminateError(wsUnavailableReason)
      return
    }
    setConfirmTerminateOpen(true)
  }

  function confirmTerminate(): void {
    if (!liveSession || !effectiveSessionId) {
      setConfirmTerminateOpen(false)
      return
    }
    if (liveSession.canTerminateSession !== true) {
      setTerminateError(
        liveSession.reason ?? 'Session termination is unavailable for this session.',
      )
      setConfirmTerminateOpen(false)
      return
    }

    setTerminateError(null)
    setIsTerminating(true)
    const queued = sendWsMessage({ type: 'session_terminate', sessionId: effectiveSessionId })
    if (!queued) {
      setTerminateError(wsUnavailableReason)
      setIsTerminating(false)
    } else {
      onClose()
    }
    setConfirmTerminateOpen(false)
  }

  function renderSurface() {
    return (
      <>
        <div className="border-b border-border bg-[var(--color-panel-surface)] px-4 py-3 shrink-0">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/20 text-[12px] font-semibold [font-family:var(--font-mono-data)] text-muted-foreground">
              {avatarLoadFailed ? (
                <span className="uppercase">{character[0]}</span>
              ) : (
                <img
                  src={characterFaceUrl(character)}
                  alt={`${character} face portrait`}
                  width={30}
                  height={30}
                  onError={() => setAvatarLoadFailed(true)}
                  style={{ imageRendering: 'pixelated' }}
                  className="h-[30px] w-[30px] object-cover"
                />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {inline ? (
                  <h2 className="[font-family:var(--font-mono-data)] text-[13px] font-semibold text-foreground uppercase tracking-[0.14em]">
                    {projectName}
                  </h2>
                ) : (
                  <Dialog.Title className="[font-family:var(--font-mono-data)] text-[13px] font-semibold text-foreground uppercase tracking-[0.14em]">
                    {projectName}
                  </Dialog.Title>
                )}
                {provider && (
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                      provider === 'claude' ? 'badge-provider-claude' : 'badge-provider-codex'
                    }`}
                  >
                    {provider}
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] [font-family:var(--font-mono-data)] ${statusStyle.textClass} ${statusStyle.borderClass} ${statusStyle.bgClass}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dotClass}`} />
                  {statusStyle.label}
                </span>
                {elapsedLabel && (
                  <span className="data-readout-dim text-[10px] tabular-nums">
                    T+{elapsedLabel}
                  </span>
                )}
                {pendingApprovals > 0 && (
                  <span
                    className="inline-flex items-center border border-cockpit-amber/55 bg-cockpit-amber/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] [font-family:var(--font-mono-data)] text-cockpit-amber"
                    style={{ textShadow: '0 0 5px color-mix(in oklch, var(--color-cockpit-amber) 40%, transparent)' }}
                  >
                    {pendingApprovals} Pending
                  </span>
                )}
              </div>
              <p className="mt-1 truncate [font-family:var(--font-mono-data)] text-[10px] text-[var(--color-cockpit-dim)]">
                {workspacePath ?? '/unknown/workspace'}
              </p>
            </div>

            <div className="ml-auto flex shrink-0 items-start gap-1.5">
              {liveSession?.status === 'active' && liveSession.canTerminateSession === true && (
                <button
                  type="button"
                  onClick={handleTerminate}
                  disabled={isTerminating}
                  className="h-7 border border-cockpit-red/60 bg-cockpit-red/10 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] [font-family:var(--font-mono-data)] text-cockpit-red hover:bg-cockpit-red/20 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isTerminating ? 'Terminating…' : 'Terminate'}
                </button>
              )}
              <button
                type="button"
                onClick={onMinimize}
                disabled={!onMinimize}
                aria-label="Minimize"
                className="h-7 w-7 border border-border/70 bg-background/50 text-[10px] [font-family:var(--font-mono-data)] text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:cursor-not-allowed disabled:opacity-55"
              >
                -
              </button>
              {inline && onSnapLayout && (
                <div ref={snapBtnRef} className="relative">
                  <button
                    type="button"
                    aria-label="Snap layout"
                    className="h-7 w-7 border border-border/70 bg-background/50 text-[11px] [font-family:var(--font-mono-data)] text-muted-foreground hover:text-foreground hover:border-[var(--color-cockpit-cyan)] transition-colors"
                    onClick={() => {
                      const rect = snapBtnRef.current?.getBoundingClientRect()
                      if (rect) setPickerAnchor({ right: window.innerWidth - rect.right, top: rect.bottom + 4 })
                      setLayoutPickerOpen((v) => !v)
                    }}
                  >
                    ⊞
                  </button>
                  {layoutPickerOpen && pickerAnchor && createPortal(
                    <div
                      ref={layoutPickerRef}
                      style={{ position: 'fixed', right: pickerAnchor.right, top: pickerAnchor.top, zIndex: 9999 }}
                      className="border border-[color-mix(in_srgb,var(--color-cockpit-cyan)_50%,var(--color-border))] bg-[var(--color-panel-surface)] p-2 shadow-2xl"
                    >
                      <p className="mb-1.5 select-none [font-family:var(--font-mono-data)] text-[8px] uppercase tracking-[0.18em] text-[var(--color-cockpit-dim)]">
                        Snap Layout
                      </p>
                      <div className="grid grid-cols-3 gap-1">
                        {SNAP_ZONE_LAYOUT.map((zone) => (
                          <button
                            key={zone}
                            type="button"
                            aria-label={`Snap ${zone}`}
                            className="group relative h-12 w-16 border border-border/50 bg-muted/10 transition-colors hover:border-[var(--color-cockpit-cyan)] hover:bg-[color-mix(in_srgb,var(--color-cockpit-cyan)_6%,transparent)]"
                            onClick={() => {
                              onSnapLayout(zone)
                              setLayoutPickerOpen(false)
                            }}
                          >
                            <SnapZonePreview zone={zone} />
                            <span className="absolute inset-x-0 bottom-0.5 text-center [font-family:var(--font-mono-data)] text-[7px] uppercase tracking-[0.1em] text-[var(--color-cockpit-dim)] group-hover:text-[var(--color-cockpit-cyan)] leading-none">
                              {SNAP_ZONE_LABELS[zone]}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>,
                    document.body,
                  )}
                </div>
              )}
              {inline ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="h-7 w-7 border border-cockpit-red/60 bg-cockpit-red/10 text-[10px] [font-family:var(--font-mono-data)] text-cockpit-red hover:bg-cockpit-red/20 transition-colors"
                  aria-label="Close"
                >
                  ×
                </button>
              ) : (
                <Dialog.Close
                  className="h-7 w-7 border border-cockpit-red/60 bg-cockpit-red/10 text-[10px] [font-family:var(--font-mono-data)] text-cockpit-red hover:bg-cockpit-red/20 transition-colors"
                  aria-label="Close"
                >
                  ×
                </Dialog.Close>
              )}
            </div>
          </div>
          {liveSession?.status === 'active' && liveSession.canTerminateSession === false && (
            <p className="mt-2 text-[10px] [font-family:var(--font-mono-data)] text-muted-foreground">
              {liveSession.reason ?? 'Session termination is unavailable for this session.'}
            </p>
          )}
        </div>
        {terminateError && (
          <div className="border-b border-cockpit-red/45 bg-cockpit-red/10 px-4 py-2 text-xs [font-family:var(--font-mono-data)] text-cockpit-red">
            {terminateError}
          </div>
        )}
        <Tabs.Root
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TabId)}
          className="flex flex-col flex-1 min-h-0 overflow-hidden"
        >
          <Tabs.List className="flex shrink-0 border-b border-border px-4">
            {TAB_IDS.map((id) => (
              <Tabs.Trigger
                key={id}
                value={id}
                className="cockpit-tab -mb-px"
              >
                <span>{TAB_LABELS[id]}</span>
                {id === 'approvals' && pendingApprovals > 0 ? (
                  <span className="ml-1 inline-flex min-w-4 items-center justify-center border border-cockpit-amber/55 bg-cockpit-amber/20 px-1 py-0 text-[9px] leading-none text-cockpit-amber">
                    {pendingApprovals}
                  </span>
                ) : null}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <SessionScopeProvider sessionId={effectiveSessionId ?? ''}>
              <Tabs.Content value="approvals" className="flex-1 min-h-0 overflow-hidden">
                <ApprovalInbox />
              </Tabs.Content>
              <Tabs.Content value="chat" forceMount className="flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden">
                {liveSession?.mode === 'pty' ? <TerminalPanel /> : <ChatPanel />}
              </Tabs.Content>
              <Tabs.Content value="timeline" className="flex-1 min-h-0 overflow-hidden">
                <TimelinePanel />
              </Tabs.Content>
              <Tabs.Content value="diff" className="flex-1 min-h-0 overflow-hidden">
                <DiffPanel />
              </Tabs.Content>
              <Tabs.Content value="memory" className="flex-1 min-h-0 overflow-hidden">
                <MemoryPanel />
              </Tabs.Content>
              <Tabs.Content value="artifacts" className="flex-1 min-h-0 overflow-hidden">
                <ArtifactsPanel />
              </Tabs.Content>
            </SessionScopeProvider>
          </div>
        </Tabs.Root>
        <div className="shrink-0 border-t border-[color-mix(in_srgb,var(--color-cockpit-accent)_26%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-cockpit-accent)_5%,transparent)] px-3 py-1.5">
          <div className="flex flex-wrap items-center gap-2 [font-family:var(--font-mono-data)] text-[10px] uppercase tracking-[0.12em]">
            <span
              className={
                wsStatus === 'connected'
                  ? 'text-[var(--color-cockpit-green)]'
                  : wsStatus === 'connecting'
                    ? 'text-cockpit-amber'
                    : 'text-[var(--color-cockpit-red)]'
              }
            >
              Daemon {wsStatus}
            </span>
            <span className="text-[var(--color-cockpit-dim)]">|</span>
            <span className="data-readout-dim">
              Tokens in {formatTokenCount(usageMetrics.inputTokens)} · out {formatTokenCount(usageMetrics.outputTokens)}
            </span>
            <span className="text-[var(--color-cockpit-dim)]">|</span>
            <span className="data-readout-dim">
              Ctx {usageMetrics.contextPercent === null ? '--' : `${usageMetrics.contextPercent}%`}
            </span>
          </div>
        </div>
        <TerminateSessionDialog
          open={open && confirmTerminateOpen && !!liveSession}
          sessionName={projectName}
          provider={liveSession?.provider ?? provider ?? 'claude'}
          isProcessing={isTerminating}
          onCancel={() => setConfirmTerminateOpen(false)}
          onConfirm={confirmTerminate}
        />
      </>
    )
  }

  if (inline) {
    if (!open) return null
    return (
      <div
        className="h-full w-full flex flex-col overflow-hidden border border-[color-mix(in_srgb,var(--color-cockpit-accent)_40%,var(--color-border))] bg-background shadow-[0_0_50px_color-mix(in_srgb,var(--color-cockpit-accent)_14%,transparent),0_26px_70px_rgba(0,0,0,0.72)]"
        aria-label={`Session: ${projectName}`}
        style={provider ? getProviderAccentStyle(provider) : undefined}
        onMouseDownCapture={onFocus}
      >
        {renderSurface()}
      </div>
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/65 backdrop-blur-[1px]" />
        <Dialog.Content
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                     w-[90vw] max-w-[1120px] h-[84vh] rounded-2xl
                     flex flex-col overflow-hidden border border-[color-mix(in_srgb,var(--color-cockpit-accent)_40%,var(--color-border))]
                     bg-background
                     shadow-[0_0_50px_color-mix(in_srgb,var(--color-cockpit-accent)_14%,transparent),0_26px_70px_rgba(0,0,0,0.72)]"
          aria-label={`Session: ${projectName}`}
          style={provider ? getProviderAccentStyle(provider) : undefined}
        >
          {renderSurface()}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
