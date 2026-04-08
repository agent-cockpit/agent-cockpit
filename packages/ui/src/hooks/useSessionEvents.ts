import { useEffect } from 'react'
import { useStore } from '../store/index.js'

// WS_URL defaults to the daemon's WebSocket port.
// Override via VITE_WS_URL env var for staging/production deployments.
const WS_URL = import.meta.env['VITE_WS_URL'] ?? 'ws://localhost:3001'
const MAX_RETRIES = 12

// Module-level singleton — one connection per app instance, survives navigation
let ws: WebSocket | null = null
let retries = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Open a WebSocket connection to the daemon.
 *
 * SESS-03 "attach to running session":
 * lastSeenSequence is read from the store AT CALL TIME (not at module init).
 * When lastSeenSequence=0 (first connect), the daemon replays ALL events
 * from the beginning — including session_start events for sessions already
 * running when the UI opened. The client has no separate "attach" action;
 * opening the connection IS the attach.
 *
 * After reconnect, lastSeenSequence is non-zero so only missed events are
 * replayed, avoiding duplicate state derivation (avoids Pitfall 1).
 */
export function connectDaemon(): void {
  // Read lastSeenSequence at call time — critical for correct reconnect behavior
  const { setWsStatus, recordSequence, applyEvent, lastSeenSequence } =
    useStore.getState()

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return
  }

  setWsStatus('connecting')
  const url = `${WS_URL}?lastSeenSequence=${lastSeenSequence}`
  ws = new WebSocket(url)

  ws.onopen = () => {
    retries = 0
    setWsStatus('connected')
  }

  ws.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data as string)
      if (typeof event.sequenceNumber === 'number') {
        recordSequence(event.sequenceNumber)
      }
      applyEvent(event)
    } catch {
      // Ignore malformed messages — daemon should only send valid JSON
    }
  }

  ws.onclose = () => {
    setWsStatus('disconnected')
    ws = null
    if (retries < MAX_RETRIES) {
      // Exponential backoff with jitter: 500ms → 30s max
      const delay = Math.min(500 * 2 ** retries + Math.random() * 200, 30_000)
      retries++
      retryTimer = setTimeout(connectDaemon, delay)
    }
  }

  ws.onerror = () => {
    ws?.close()
  }
}

/**
 * React hook — call once at app root.
 * Opens the daemon WebSocket connection and cleans up on unmount.
 */
export function useSessionEvents(): void {
  useEffect(() => {
    connectDaemon()
    return () => {
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
      ws?.close()
      ws = null
    }
  }, [])
}

/**
 * Send a JSON message over the daemon WebSocket.
 * No-ops silently if the connection is not open — caller should
 * disable UI actions when wsStatus !== 'connected'.
 */
export function sendWsMessage(msg: object): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}
