import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ptyBus } from '../ptyBus.js'
import {
  attachTerminalSession,
  detachTerminalSession,
  getTerminalSession,
  resetTerminalSessionsForTests,
  scheduleTerminalResize,
} from '../terminalSessions.js'
import { sendWsMessage } from '../../hooks/useSessionEvents.js'

const terminalMock = vi.hoisted(() => ({
  instances: [] as Array<{
    element?: HTMLElement
    cols: number
    rows: number
    options: Record<string, unknown>
    writes: string[]
    dataHandlers: Array<(data: string) => void>
    loadAddon: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
    write: ReturnType<typeof vi.fn>
    clear: ReturnType<typeof vi.fn>
    scrollToBottom: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    onData: ReturnType<typeof vi.fn>
    open: ReturnType<typeof vi.fn>
    emitData: (data: string) => void
  }>,
}))

const fitMock = vi.hoisted(() => ({
  instances: [] as Array<{
    dims: { cols: number; rows: number } | undefined
    fit: ReturnType<typeof vi.fn>
    proposeDimensions: ReturnType<typeof vi.fn>
    activate: (term: { cols: number; rows: number }) => void
  }>,
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class MockTerminal {
    element?: HTMLElement
    cols = 80
    rows = 24
    options: Record<string, unknown>
    writes: string[] = []
    dataHandlers: Array<(data: string) => void> = []
    loadAddon = vi.fn((addon: { activate?: (term: MockTerminal) => void }) => addon.activate?.(this))
    focus = vi.fn()
    write = vi.fn((data: string, callback?: () => void) => {
      this.writes.push(data)
      callback?.()
    })
    clear = vi.fn()
    scrollToBottom = vi.fn()
    dispose = vi.fn()
    onData = vi.fn((handler: (data: string) => void) => {
      this.dataHandlers.push(handler)
      return {
        dispose: vi.fn(() => {
          this.dataHandlers = this.dataHandlers.filter((candidate) => candidate !== handler)
        }),
      }
    })
    open = vi.fn((parent: HTMLElement) => {
      this.element = document.createElement('div')
      this.element.dataset.testid = 'xterm'
      parent.appendChild(this.element)
    })

    constructor(options: Record<string, unknown>) {
      this.options = options
      terminalMock.instances.push(this)
    }

    emitData(data: string): void {
      this.dataHandlers.forEach((handler) => handler(data))
    }
  },
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class MockFitAddon {
    dims: { cols: number; rows: number } | undefined = { cols: 100, rows: 30 }
    private term: { cols: number; rows: number } | null = null
    activate = (term: { cols: number; rows: number }) => { this.term = term }
    proposeDimensions = vi.fn(() => this.dims)
    fit = vi.fn(() => {
      if (!this.term || !this.dims) return
      this.term.cols = this.dims.cols
      this.term.rows = this.dims.rows
    })

    constructor() {
      fitMock.instances.push(this)
    }
  },
}))

vi.mock('../../hooks/useSessionEvents.js', () => ({
  sendWsMessage: vi.fn(),
}))

const mockSendWsMessage = vi.mocked(sendWsMessage)

describe('terminalSessions', () => {
  beforeEach(() => {
    vi.useRealTimers()
    resetTerminalSessionsForTests()
    terminalMock.instances.length = 0
    fitMock.instances.length = 0
    mockSendWsMessage.mockClear()
  })

  it('creates one persistent terminal per session and reattaches its DOM element', () => {
    const firstContainer = document.createElement('div')
    const secondContainer = document.createElement('div')

    ptyBus.emit('session-a', 'output before attach')
    attachTerminalSession('session-a', firstContainer)

    expect(terminalMock.instances).toHaveLength(1)
    expect(terminalMock.instances[0]!.options['scrollback']).toBe(10_000)
    expect(terminalMock.instances[0]!.options['windowsPty']).toEqual({ backend: 'winpty' })
    expect(terminalMock.instances[0]!.clear).toHaveBeenCalledTimes(1)
    expect(mockSendWsMessage).toHaveBeenCalledWith({ type: 'pty_resize', sessionId: 'session-a', cols: 100, rows: 30 })
    expect(terminalMock.instances[0]!.writes).toContain('output before attach')
    expect(terminalMock.instances[0]!.scrollToBottom).toHaveBeenCalled()
    expect(firstContainer.querySelector('[data-testid="xterm"]')).not.toBeNull()

    mockSendWsMessage.mockClear()
    terminalMock.instances[0]!.clear.mockClear()
    detachTerminalSession('session-a', firstContainer)
    attachTerminalSession('session-a', secondContainer)

    expect(terminalMock.instances).toHaveLength(1)
    expect(firstContainer.querySelector('[data-testid="xterm"]')).toBeNull()
    expect(secondContainer.querySelector('[data-testid="xterm"]')).toBe(terminalMock.instances[0]!.element)
    expect(terminalMock.instances[0]!.clear).not.toHaveBeenCalled()
    expect(mockSendWsMessage).not.toHaveBeenCalledWith({ type: 'pty_resize', sessionId: 'session-a', cols: 100, rows: 30 })
  })

  it('keeps receiving PTY output while detached', () => {
    const container = document.createElement('div')
    attachTerminalSession('session-a', container)
    detachTerminalSession('session-a', container)

    ptyBus.emit('session-a', 'live while hidden')

    expect(terminalMock.instances[0]!.writes).toContain('live while hidden')
    expect(terminalMock.instances[0]!.scrollToBottom).toHaveBeenCalled()
  })

  it('forwards user input, clears stale redraw content, and syncs terminal resizes to the PTY', () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    attachTerminalSession('session-a', container)
    mockSendWsMessage.mockClear()
    terminalMock.instances[0]!.clear.mockClear()
    fitMock.instances[0]!.dims = { cols: 120, rows: 40 }

    terminalMock.instances[0]!.emitData('\r')
    scheduleTerminalResize('session-a')
    vi.advanceTimersByTime(150)

    expect(mockSendWsMessage).toHaveBeenCalledWith({ type: 'pty_input', sessionId: 'session-a', data: '\r' })
    expect(terminalMock.instances[0]!.clear).toHaveBeenCalledTimes(1)
    expect(mockSendWsMessage).toHaveBeenCalledWith({ type: 'pty_resize', sessionId: 'session-a', cols: 120, rows: 40 })
    expect(fitMock.instances[0]!.fit).toHaveBeenCalled()
    expect(terminalMock.instances[0]!.writes).not.toContain('\x1b[3J\x1b[2J\x1b[H]')
  })

  it('does not resend resize messages when dimensions are unchanged', () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    attachTerminalSession('session-a', container)
    mockSendWsMessage.mockClear()
    terminalMock.instances[0]!.clear.mockClear()

    scheduleTerminalResize('session-a')
    vi.advanceTimersByTime(150)

    expect(terminalMock.instances[0]!.clear).not.toHaveBeenCalled()
    expect(mockSendWsMessage).not.toHaveBeenCalledWith({ type: 'pty_resize', sessionId: 'session-a', cols: 100, rows: 30 })
  })

  it('reuses existing sessions returned by getTerminalSession', () => {
    const first = getTerminalSession('session-a')
    const second = getTerminalSession('session-a')

    expect(first).toBe(second)
    expect(terminalMock.instances).toHaveLength(1)
  })
})
