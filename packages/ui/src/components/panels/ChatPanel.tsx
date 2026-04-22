import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useStore } from '../../store/index.js'
import { sendWsMessage } from '../../hooks/useSessionEvents.js'
import type { NormalizedEvent } from '@cockpit/shared'
import { EMPTY_EVENTS } from '../../store/eventsSlice.js'

function isChatMessage(event: NormalizedEvent): event is NormalizedEvent & {
  type: 'session_chat_message'
  role: 'user' | 'assistant' | 'system'
  content: string
} {
  return event.type === 'session_chat_message'
}

function isChatError(event: NormalizedEvent): event is NormalizedEvent & {
  type: 'session_chat_error'
  reason: string
} {
  return event.type === 'session_chat_error'
}

export function ChatPanel() {
  const { sessionId: paramSessionId } = useParams<{ sessionId: string }>()
  const storeSessionId = useStore((s) => s.selectedSessionId)
  const sessionId = paramSessionId ?? storeSessionId ?? ''
  const session = useStore((s) => (sessionId ? s.sessions[sessionId] : undefined))
  const events = useStore((s) => (sessionId ? s.events[sessionId] : EMPTY_EVENTS) ?? EMPTY_EVENTS)
  const wsStatus = useStore((s) => s.wsStatus)

  const [message, setMessage] = useState('')
  const [awaitingReply, setAwaitingReply] = useState(false)
  const [lastSendAt, setLastSendAt] = useState<string | null>(null)
  const [isComposerFocused, setIsComposerFocused] = useState(false)
  const replyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const composerInputRef = useRef<HTMLInputElement | null>(null)
  const composerMeasureRef = useRef<HTMLSpanElement | null>(null)
  const [caretOffsetPx, setCaretOffsetPx] = useState(0)

  const chatMessages = useMemo(
    () => events.filter(isChatMessage),
    [events],
  )

  const latestError = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i]
      if (event && isChatError(event)) {
        return event.reason
      }
    }
    return undefined
  }, [events])

  const sendEnabledForSession = session?.canSendMessage === true
  const canSend = sendEnabledForSession && wsStatus === 'connected' && !awaitingReply

  const promptPlaceholder = canSend ? 'Type a message' : 'Waiting for reply'
  const showTerminalCaret = canSend && isComposerFocused
  const caretClassName = message.length > 0
    ? 'chat-terminal-caret chat-terminal-caret-solid'
    : 'chat-terminal-caret'

  useEffect(() => {
    return () => {
      if (replyTimeoutRef.current) {
        clearTimeout(replyTimeoutRef.current)
        replyTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!awaitingReply || !lastSendAt) return
    const resolved = events.some((event) => {
      if (event.timestamp < lastSendAt) return false
      if (isChatError(event)) return true
      return isChatMessage(event) && event.role === 'assistant'
    })
    if (!resolved) return
    setAwaitingReply(false)
    if (replyTimeoutRef.current) {
      clearTimeout(replyTimeoutRef.current)
      replyTimeoutRef.current = null
    }
  }, [awaitingReply, events, lastSendAt])

  useEffect(() => {
    if (wsStatus === 'connected') return
    setAwaitingReply(false)
    if (replyTimeoutRef.current) {
      clearTimeout(replyTimeoutRef.current)
      replyTimeoutRef.current = null
    }
  }, [wsStatus])

  useLayoutEffect(() => {
    const input = composerInputRef.current
    const measure = composerMeasureRef.current
    if (!input || !measure) return

    measure.textContent = message
    const measuredWidth = measure.getBoundingClientRect().width
    setCaretOffsetPx(measuredWidth - input.scrollLeft)
  }, [message])

  function onSend(): void {
    const content = message.trim()
    if (!sessionId || !content || !canSend) return
    const sentAt = new Date().toISOString()
    setLastSendAt(sentAt)
    setAwaitingReply(true)
    if (replyTimeoutRef.current) {
      clearTimeout(replyTimeoutRef.current)
      replyTimeoutRef.current = null
    }
    replyTimeoutRef.current = setTimeout(() => {
      setAwaitingReply(false)
      replyTimeoutRef.current = null
    }, 45_000)
    sendWsMessage({ type: 'session_chat', sessionId, content })
    setMessage('')
  }

  if (!sessionId || !session) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p className="cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }}>
          -- NO SESSION SELECTED --
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col text-[var(--color-foreground)]">
      <div className="border-b border-border p-3">
        <h2 className="cockpit-label">Session Chat</h2>
        {latestError && (
          <p className="mt-1 text-xs text-[var(--color-cockpit-red)]">{latestError}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2" data-testid="chat-history">
        {chatMessages.length === 0 && !awaitingReply ? (
          <p className="cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }}>
            -- NO CHAT MESSAGES --
          </p>
        ) : (
          <>
            {chatMessages.map((chat, index) => (
              <div
                key={`${chat.timestamp}-${index}`}
                className="flex items-start gap-2 [font-family:var(--font-mono-data)] text-sm leading-relaxed"
              >
                {chat.role === 'user' ? (
                  <span className="shrink-0 text-[var(--color-cockpit-accent)]" aria-hidden>
                    &gt;
                  </span>
                ) : (
                  <span
                    className={`shrink-0 text-base leading-none ${
                      chat.provider === 'claude'
                        ? 'text-[var(--color-cockpit-amber)]'
                        : chat.provider === 'codex'
                          ? 'text-[var(--color-cockpit-accent)]'
                          : 'text-[var(--color-cockpit-dim)]'
                    }`}
                    aria-hidden
                  >
                    •
                  </span>
                )}
                <p className="min-w-0 whitespace-pre-wrap text-[var(--color-foreground)]">{chat.content}</p>
              </div>
            ))}
            {awaitingReply && (
              <div className="flex items-start gap-2 [font-family:var(--font-mono-data)] text-sm leading-relaxed">
                <span
                  className={`shrink-0 text-base leading-none ${
                    session.provider === 'claude'
                      ? 'text-[var(--color-cockpit-amber)]'
                      : 'text-[var(--color-cockpit-accent)]'
                  }`}
                  aria-hidden
                >
                  •
                </span>
                <p className="min-w-0 text-[var(--color-cockpit-dim)] italic animate-pulse">
                  {session.provider === 'claude' ? 'Claude is thinking...' : 'Codex is thinking...'}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {sendEnabledForSession ? (
        <div className="border-t border-border p-3">
          <div className={`relative border bg-[oklch(0.23_0.02_250)] ${awaitingReply ? 'border-[var(--color-cockpit-dim)]' : 'border-border'}`}>
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-cockpit-accent)] [font-family:var(--font-mono-data)]"
              aria-hidden
            >
              &gt;
            </span>
            <input
              ref={composerInputRef}
              type="text"
              aria-label="Chat message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onFocus={() => setIsComposerFocused(true)}
              onBlur={() => setIsComposerFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onSend()
                }
              }}
              placeholder={promptPlaceholder}
              className="block min-h-11 w-full border-0 bg-transparent py-2 pr-3 pl-7 text-sm text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-cockpit-dim)] [font-family:var(--font-mono-data)] caret-transparent disabled:cursor-not-allowed"
              disabled={wsStatus !== 'connected' || awaitingReply}
            />
            {showTerminalCaret && (
              <span
                className={`${caretClassName} pointer-events-none absolute top-1/2 -translate-y-1/2`}
                style={{ left: `calc(1.75rem + ${caretOffsetPx}px)` }}
                aria-hidden
              />
            )}
            <span
              ref={composerMeasureRef}
              className="pointer-events-none absolute left-0 top-0 invisible whitespace-pre text-sm [font-family:var(--font-mono-data)]"
              aria-hidden
            />
          </div>
        </div>
      ) : (
        <div className="border-t border-border p-3">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            This session is approval-only and does not support chat sends.
          </p>
          {session.reason && (
            <p className="text-xs mt-1 text-[var(--color-muted-foreground)]">{session.reason}</p>
          )}
        </div>
      )}
    </div>
  )
}
