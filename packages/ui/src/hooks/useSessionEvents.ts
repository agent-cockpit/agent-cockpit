import { useEffect } from 'react'
import type { NormalizedEvent } from '@cockpit/shared'
import { useStore } from '../store/index.js'
import { WS_URL } from '../lib/daemonUrl.js'
const MAX_RETRIES = 12

// Module-level singleton — one connection per app instance, survives navigation
let ws: WebSocket | null = null
let retries = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
const CATCHUP_FALLBACK_FLUSH_MS = 800

interface CatchupCompleteMessage {
  type: 'catchup_complete'
  lastSeenSequence: number
  latestSequenceNumber: number
}

function isCatchupCompleteMessage(value: unknown): value is CatchupCompleteMessage {
  if (!value || typeof value !== 'object') return false
  const msg = value as Record<string, unknown>
  return (
    msg['type'] === 'catchup_complete' &&
    typeof msg['lastSeenSequence'] === 'number' &&
    typeof msg['latestSequenceNumber'] === 'number'
  )
}

function isNormalizedEvent(value: unknown): value is NormalizedEvent & { sequenceNumber?: number } {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  return (
    typeof event['type'] === 'string' &&
    typeof event['sessionId'] === 'string' &&
    typeof event['timestamp'] === 'string'
  )
}

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
  const { setWsStatus, recordSequence, applyEvent, applyEventsBatch, lastSeenSequence } =
    useStore.getState()

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return
  }

  console.log('[WS] connectDaemon called, lastSeenSequence:', lastSeenSequence)
  setWsStatus('connecting')
  const url = `${WS_URL}?lastSeenSequence=${lastSeenSequence}`
  const socket = new WebSocket(url)
  ws = socket
  console.log('[WS] socket created, readyState:', socket.readyState)
  const replayBuffer: NormalizedEvent[] = []
  let replayMaxSequence = lastSeenSequence
  let waitingForCatchupComplete = lastSeenSequence === 0
  let catchupFallbackTimer: ReturnType<typeof setTimeout> | null = null

  function clearCatchupFallback(): void {
    if (!catchupFallbackTimer) return
    clearTimeout(catchupFallbackTimer)
    catchupFallbackTimer = null
  }

  function flushReplayBuffer(sequenceOverride?: number): void {
    if (!waitingForCatchupComplete) return
    waitingForCatchupComplete = false
    clearCatchupFallback()
    if (replayBuffer.length > 0) {
      applyEventsBatch(replayBuffer)
      replayBuffer.length = 0
    }
    const nextSequence = typeof sequenceOverride === 'number' ? sequenceOverride : replayMaxSequence
    recordSequence(nextSequence)
  }

  function scheduleCatchupFallback(): void {
    if (!waitingForCatchupComplete) return
    clearCatchupFallback()
    catchupFallbackTimer = setTimeout(() => {
      console.warn('[WS] catchup_complete timeout — applying buffered replay events')
      flushReplayBuffer()
    }, CATCHUP_FALLBACK_FLUSH_MS)
  }

  socket.onopen = () => {
    console.log('[WS] connected')
    retries = 0
    setWsStatus('connected')
  }

  socket.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data as string)

      if (isCatchupCompleteMessage(payload)) {
        console.log('[WS] catchup complete:', payload.latestSequenceNumber)
        flushReplayBuffer(payload.latestSequenceNumber)
        return
      }

      if (!isNormalizedEvent(payload)) {
        console.warn('[WS] ignoring unrecognized message payload')
        return
      }

      console.log('[WS] message received:', payload.type, payload.sequenceNumber)
      if (typeof payload.sequenceNumber === 'number') {
        replayMaxSequence = Math.max(replayMaxSequence, payload.sequenceNumber)
      }

      if (waitingForCatchupComplete) {
        replayBuffer.push(payload)
        scheduleCatchupFallback()
        return
      }

      if (typeof payload.sequenceNumber === 'number') {
        recordSequence(payload.sequenceNumber)
      }
      applyEvent(payload)
    } catch (err) {
      console.error('[WS] applyEvent error:', err)
    }
  }

  socket.onclose = (e) => {
    console.log('[WS] socket closed, code:', e.code, 'wasClean:', e.wasClean, 'ws===socket:', ws === socket)
    // Only take ownership if this socket is still the active one.
    // In React StrictMode, cleanup closes a connecting socket while a new one
    // is already assigned to `ws` — the stale onclose must not null it out.
    if (ws !== socket) return
    clearCatchupFallback()
    waitingForCatchupComplete = false
    replayBuffer.length = 0
    setWsStatus('disconnected')
    ws = null
    if (retries < MAX_RETRIES) {
      // Exponential backoff with jitter: 500ms → 30s max
      const delay = Math.min(500 * 2 ** retries + Math.random() * 200, 30_000)
      retries++
      console.log('[WS] retrying in', delay, 'ms, attempt', retries)
      retryTimer = setTimeout(connectDaemon, delay)
    } else {
      console.warn('[WS] max retries reached, giving up')
    }
  }

  socket.onerror = (e) => {
    console.error('[WS] socket error:', e)
    socket.close()
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
 * Returns false if the connection is not open so callers can show
 * immediate user-facing feedback instead of failing silently.
 */
export function sendWsMessage(msg: object): boolean {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
    return true
  }
  return false
}
