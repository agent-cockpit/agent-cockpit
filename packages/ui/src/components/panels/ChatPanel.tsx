import { useMemo, useState } from 'react'
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
  const canSend = sendEnabledForSession && wsStatus === 'connected'

  function onSend(): void {
    const content = message.trim()
    if (!sessionId || !content || !canSend) return
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
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-3">
        <h2 className="cockpit-label">Session Chat</h2>
        {latestError && (
          <p className="mt-1 text-xs text-[var(--color-cockpit-red)]">{latestError}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2" data-testid="chat-history">
        {chatMessages.length === 0 ? (
          <p className="cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }}>
            -- NO CHAT MESSAGES --
          </p>
        ) : (
          chatMessages.map((chat, index) => (
            <div
              key={`${chat.timestamp}-${index}`}
              className="border border-border/70 bg-[var(--color-panel-surface)] px-3 py-2"
            >
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground [font-family:var(--font-mono-data)]">
                {chat.role}
              </p>
              <p className="text-sm mt-0.5 whitespace-pre-wrap">{chat.content}</p>
            </div>
          ))
        )}
      </div>

      {sendEnabledForSession ? (
        <div className="border-t border-border p-3 flex gap-2 items-center">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onSend()
              }
            }}
            placeholder="Send a message"
            className="flex-1 bg-[var(--color-panel-surface)] border border-border px-3 py-2 text-sm [font-family:var(--font-mono-data)]"
            disabled={wsStatus !== 'connected'}
          />
          <button
            className="cockpit-btn text-xs px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onSend}
            disabled={!canSend || message.trim().length === 0}
          >
            Send
          </button>
        </div>
      ) : (
        <div className="border-t border-border p-3">
          <p className="text-xs text-muted-foreground">
            This session is approval-only and does not support chat sends.
          </p>
          {session.reason && (
            <p className="text-xs mt-1 text-muted-foreground">{session.reason}</p>
          )}
        </div>
      )}
    </div>
  )
}
