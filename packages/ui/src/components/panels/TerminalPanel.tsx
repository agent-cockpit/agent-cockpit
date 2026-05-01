import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { sendWsMessage } from '../../hooks/useSessionEvents.js'
import { ptyBus } from '../../lib/ptyBus.js'
import { usePanelSessionId } from './sessionScope.js'

export function TerminalPanel() {
  const sessionId = usePanelSessionId()
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !sessionId) return

    const term = new Terminal({
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      cursorBlink: true,
      allowTransparency: false,
      theme: {
        background: '#0d0d14',
        foreground: '#e2e8f0',
        cursor: '#a3e635',
        cursorAccent: '#0d0d14',
        selectionBackground: 'rgba(163,230,53,0.25)',
        black: '#1a1a2e',
        red: '#ff6b6b',
        green: '#a3e635',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e2e8f0',
        brightBlack: '#4a4a6a',
        brightRed: '#ff8585',
        brightGreen: '#bef264',
        brightYellow: '#fcd34d',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#f8fafc',
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      try { fitAddon.fit() } catch {}
    }
    term.focus()

    const unsubscribe = ptyBus.subscribe(sessionId, (data) => term.write(data))
    term.onData((data) => { sendWsMessage({ type: 'pty_input', sessionId, data }) })

    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    let hasFitted = false
    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      const delay = hasFitted ? 50 : 0
      resizeTimer = setTimeout(() => {
        if (container.clientWidth === 0 || container.clientHeight === 0) return
        try { fitAddon.fit() } catch { return }
        hasFitted = true
        if (term.cols > 0 && term.rows > 0) {
          sendWsMessage({ type: 'pty_resize', sessionId, cols: term.cols, rows: term.rows })
        }
      }, delay)
    })
    observer.observe(container)

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      unsubscribe()
      observer.disconnect()
      term.dispose()
    }
  }, [sessionId])

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden bg-[#0d0d14]" />
  )
}
