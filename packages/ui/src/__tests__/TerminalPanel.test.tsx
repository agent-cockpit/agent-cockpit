import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { TerminalPanel } from '../components/panels/TerminalPanel.js'

const {
  mockWrite,
  mockFit,
  mockOpen,
  mockFocus,
  mockDispose,
  mockLoadAddon,
  mockOnData,
  mockSendWsMessage,
  mockSubscribe,
} = vi.hoisted(() => ({
  mockWrite: vi.fn(),
  mockFit: vi.fn(),
  mockOpen: vi.fn(),
  mockFocus: vi.fn(),
  mockDispose: vi.fn(),
  mockLoadAddon: vi.fn(),
  mockOnData: vi.fn(),
  mockSendWsMessage: vi.fn(),
  mockSubscribe: vi.fn(),
}))
let resizeCallback: (() => void) | null = null
let terminalDataHandler: ((data: string) => void) | null = null
const clientWidthGetter = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get')
const clientHeightGetter = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get')

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    loadAddon: mockLoadAddon,
    open: mockOpen,
    focus: mockFocus,
    write: mockWrite,
    dispose: mockDispose,
    onData: mockOnData.mockImplementation((handler: (data: string) => void) => {
      terminalDataHandler = handler
    }),
    cols: 132,
    rows: 40,
  })),
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: mockFit,
  })),
}))

vi.mock('../hooks/useSessionEvents.js', () => ({
  sendWsMessage: mockSendWsMessage,
}))

vi.mock('../lib/ptyBus.js', () => ({
  ptyBus: {
    subscribe: mockSubscribe.mockImplementation((_sessionId: string, handler: (data: string) => void) => {
      return () => {
        handler('')
      }
    }),
  },
}))

class MockResizeObserver {
  constructor(callback: () => void) {
    resizeCallback = callback
  }

  observe() {}
  disconnect() {}
}

global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

function renderPanel(sessionId = 'session-pty') {
  return render(
    <MemoryRouter initialEntries={[`/session/${sessionId}/chat`]}>
      <Routes>
        <Route path="/session/:sessionId/chat" element={<TerminalPanel />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  mockWrite.mockClear()
  mockFit.mockClear()
  mockOpen.mockClear()
  mockFocus.mockClear()
  mockDispose.mockClear()
  mockLoadAddon.mockClear()
  mockOnData.mockClear()
  mockSendWsMessage.mockClear()
  mockSubscribe.mockClear()
  resizeCallback = null
  terminalDataHandler = null
  clientWidthGetter.mockReturnValue(1280)
  clientHeightGetter.mockReturnValue(720)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TerminalPanel', () => {
  it('subscribes to PTY output and renders incoming terminal bytes', () => {
    mockSubscribe.mockImplementationOnce((_sessionId: string, handler: (data: string) => void) => {
      handler('hello from pty')
      return () => {}
    })

    renderPanel()

    expect(mockSubscribe).toHaveBeenCalledWith('session-pty', expect.any(Function))
    expect(mockWrite).toHaveBeenCalledWith('hello from pty')
  })

  it('forwards terminal input to the daemon as pty_input', () => {
    renderPanel()

    terminalDataHandler?.('npm test\n')

    expect(mockSendWsMessage).toHaveBeenCalledWith({
      type: 'pty_input',
      sessionId: 'session-pty',
      data: 'npm test\n',
    })
  })

  it('fits and emits pty_resize when the terminal container resizes', () => {
    renderPanel()

    act(() => {
      resizeCallback?.()
      vi.runAllTimers()
    })

    expect(mockFit).toHaveBeenCalled()
    expect(mockSendWsMessage).toHaveBeenCalledWith({
      type: 'pty_resize',
      sessionId: 'session-pty',
      cols: 132,
      rows: 40,
    })
  })
})
