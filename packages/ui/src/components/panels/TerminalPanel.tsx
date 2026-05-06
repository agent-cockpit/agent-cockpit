import { useEffect, useRef } from 'react'
import {
  attachTerminalSession,
  detachTerminalSession,
  scheduleTerminalResize,
} from '../../lib/terminalSessions.js'
import { usePanelSessionId } from './sessionScope.js'

export function TerminalPanel() {
  const sessionId = usePanelSessionId()
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !sessionId) return

    let initialized = false

    // Defer term.open() until the container is actually visible (non-zero size).
    // Calling term.open() on a display:none element corrupts the xterm canvas state.
    const observer = new ResizeObserver(() => {
      if (container.clientWidth === 0 || container.clientHeight === 0) return

      if (!initialized) {
        initialized = true
        attachTerminalSession(sessionId, container)
        return
      }

      scheduleTerminalResize(sessionId)
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      detachTerminalSession(sessionId, container)
    }
  }, [sessionId])

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden bg-[#0d0d14]" />
  )
}
