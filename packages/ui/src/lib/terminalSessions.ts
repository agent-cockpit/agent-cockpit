import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { sendWsMessage } from '../hooks/useSessionEvents.js'
import { ptyBus } from './ptyBus.js'

const RESIZE_DEBOUNCE_MS = 150

interface TerminalSession {
  term: Terminal
  fitAddon: FitAddon
  opened: boolean
  resizeTimer: ReturnType<typeof setTimeout> | null
  inputDisposable: ReturnType<Terminal['onData']>
  unsubscribe: () => void
}

const sessions = new Map<string, TerminalSession>()

function createTerminalSession(sessionId: string): TerminalSession {
  const term = new Terminal({
    fontFamily: '"JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
    fontSize: 13,
    cursorBlink: true,
    allowTransparency: false,
    scrollback: 10_000,
    windowsPty: { backend: 'winpty' },
    theme: {
      background: '#0a0a12',
      foreground: '#e8e8f0',
      cursor: '#a78bfa',
      cursorAccent: '#0a0a12',
      selectionBackground: 'rgba(167,139,250,0.22)',
      black: '#12121c',
      red: '#f87171',
      green: '#86efac',
      yellow: '#fbbf24',
      blue: '#818cf8',
      magenta: '#c084fc',
      cyan: '#67e8f9',
      white: '#e2e8f0',
      brightBlack: '#3f3f5a',
      brightRed: '#fca5a5',
      brightGreen: '#bbf7d0',
      brightYellow: '#fcd34d',
      brightBlue: '#a5b4fc',
      brightMagenta: '#d8b4fe',
      brightCyan: '#a5f3fc',
      brightWhite: '#f8fafc',
    },
  })

  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)

  const unsubscribe = ptyBus.subscribe(sessionId, (data) => {
    term.write(data, () => term.scrollToBottom())
  })
  const inputDisposable = term.onData((data) => {
    sendWsMessage({ type: 'pty_input', sessionId, data })
  })

  return {
    term,
    fitAddon,
    opened: false,
    resizeTimer: null,
    inputDisposable,
    unsubscribe,
  }
}

function fitTerminal(sessionId: string, session: TerminalSession): void {
  const dims = session.fitAddon.proposeDimensions()
  if (!dims || dims.cols <= 0 || dims.rows <= 0) return
  if (dims.cols === session.term.cols && dims.rows === session.term.rows) return

  const prevCols = session.term.cols
  const prevRows = session.term.rows
  try {
    session.fitAddon.fit()
  } catch {
    return
  }

  const cols = session.term.cols
  const rows = session.term.rows
  if (cols <= 0 || rows <= 0) return
  if (cols === prevCols && rows === prevRows) return

  session.term.clear()
  sendWsMessage({ type: 'pty_resize', sessionId, cols, rows })
}

export function getTerminalSession(sessionId: string): TerminalSession {
  const existing = sessions.get(sessionId)
  if (existing) return existing

  const session = createTerminalSession(sessionId)
  sessions.set(sessionId, session)
  return session
}

export function attachTerminalSession(sessionId: string, container: HTMLElement): void {
  const session = getTerminalSession(sessionId)

  if (!session.opened) {
    session.term.open(container)
    session.opened = true
  } else if (session.term.element && session.term.element.parentElement !== container) {
    container.appendChild(session.term.element)
  }

  fitTerminal(sessionId, session)
  session.term.focus()
}

export function attachTerminalSessionPassive(sessionId: string, container: HTMLElement): void {
  const session = getTerminalSession(sessionId)

  if (!session.opened) {
    session.term.open(container)
    session.opened = true
  } else if (session.term.element && session.term.element.parentElement !== container) {
    container.appendChild(session.term.element)
  }

  fitTerminal(sessionId, session)
  // No focus — passive mounts must not steal keyboard focus from the active block.
}

export function scheduleTerminalResize(sessionId: string): void {
  const session = getTerminalSession(sessionId)
  if (!session.opened || !session.term.element) return

  if (session.resizeTimer !== null) clearTimeout(session.resizeTimer)
  session.resizeTimer = setTimeout(() => {
    session.resizeTimer = null
    fitTerminal(sessionId, session)
  }, RESIZE_DEBOUNCE_MS)
}

export function detachTerminalSession(sessionId: string, container: HTMLElement): void {
  const session = sessions.get(sessionId)
  if (!session) return

  if (session.resizeTimer !== null) {
    clearTimeout(session.resizeTimer)
    session.resizeTimer = null
  }

  const element = session.term.element
  if (element?.parentElement === container) {
    container.removeChild(element)
  }
}

export function disposeTerminalSession(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (!session) return

  if (session.resizeTimer !== null) clearTimeout(session.resizeTimer)
  session.inputDisposable.dispose()
  session.unsubscribe()
  session.term.dispose()
  sessions.delete(sessionId)
  ptyBus.clear(sessionId)
}

export function resetTerminalSessionsForTests(): void {
  sessions.forEach((session) => {
    if (session.resizeTimer !== null) clearTimeout(session.resizeTimer)
    session.inputDisposable.dispose()
    session.unsubscribe()
    session.term.dispose()
  })
  sessions.clear()
  ptyBus.clearAll()
}
