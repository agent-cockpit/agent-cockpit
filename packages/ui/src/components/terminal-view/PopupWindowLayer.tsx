import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../store/index.js'
import type { SnapZone } from '../../store/index.js'
import { InstancePopupHub } from '../office/InstancePopupHub.js'
import { getSessionTitle } from '../../lib/sessionTitle.js'

const SNAP_EDGE_PX = 80
const SNAP_TOP_PX = 48
const POPUP_MARGIN = 8
const POPUP_DOCK_RESERVE = 72
const POPUP_MIN_WIDTH = 560
const POPUP_MIN_HEIGHT = 360

type ResizeDir = 'se' | 'sw' | 'ne' | 'nw' | 'n' | 's' | 'e' | 'w'

interface SnapGhostRect {
  zone: SnapZone
  x: number
  y: number
  width: number
  height: number
}

function computeSnapRect(
  zone: SnapZone,
  hostW: number,
  hostH: number,
  margin: number,
  dockReserve: number,
): { x: number; y: number; width: number; height: number } {
  const fullH = hostH - margin - dockReserve
  const halfW = Math.floor((hostW - 3 * margin) / 2)
  const halfH = Math.floor((fullH - margin) / 2)
  const col2x = margin + halfW + margin
  switch (zone) {
    case 'left':        return { x: margin, y: margin, width: halfW, height: fullH }
    case 'right':       return { x: col2x, y: margin, width: halfW, height: fullH }
    case 'maximize':    return { x: margin, y: margin, width: hostW - 2 * margin, height: fullH }
    case 'topleft':     return { x: margin, y: margin, width: halfW, height: halfH }
    case 'topright':    return { x: col2x, y: margin, width: halfW, height: halfH }
    case 'bottomleft':  return { x: margin, y: margin + halfH + margin, width: halfW, height: halfH }
    case 'bottomright': return { x: col2x, y: margin + halfH + margin, width: halfW, height: halfH }
  }
}

function detectSnapZone(px: number, py: number, hostW: number, hostH: number): SnapZone | null {
  const nearL = px < SNAP_EDGE_PX
  const nearR = px > hostW - SNAP_EDGE_PX
  const nearT = py < SNAP_TOP_PX
  if (nearT && nearL) return 'topleft'
  if (nearT && nearR) return 'topright'
  if (nearT) return 'maximize'
  if (nearL) return 'left'
  if (nearR) return 'right'
  return null
}

export function PopupWindowLayer() {
  const popupWindows = useStore((s) => s.popupWindows)
  const popupWindowOrder = useStore((s) => s.popupWindowOrder)
  const selectedSessionId = useStore((s) => s.selectedSessionId)
  const sessions = useStore((s) => s.sessions)
  const closeSessionPopup = useStore((s) => s.closeSessionPopup)
  const minimizeSessionPopup = useStore((s) => s.minimizeSessionPopup)
  const restoreSessionPopup = useStore((s) => s.restoreSessionPopup)
  const bringSessionPopupToFront = useStore((s) => s.bringSessionPopupToFront)
  const setSessionPopupRect = useStore((s) => s.setSessionPopupRect)
  const clearSessionPopupPreferredTab = useStore((s) => s.clearSessionPopupPreferredTab)

  const containerRef = useRef<HTMLDivElement>(null)
  const [snapGhost, setSnapGhost] = useState<SnapGhostRect | null>(null)

  const gestureRef = useRef<{
    pointerId: number
    mode: 'move' | `resize-${ResizeDir}`
    sessionId: string
    startClientX: number
    startClientY: number
    startX: number
    startY: number
    startWidth: number
    startHeight: number
    snapTarget: SnapGhostRect | null
  } | null>(null)

  const orderedPopupSessionIds = popupWindowOrder.filter((id) => !!popupWindows[id])

  function popupLabel(sessionId: string): string {
    return getSessionTitle(sessions[sessionId]?.workspacePath, sessionId)
  }

  function startGesture(
    mode: 'move' | `resize-${ResizeDir}`,
    sessionId: string,
    pointerId: number,
    clientX: number,
    clientY: number,
  ): void {
    const popup = popupWindows[sessionId]
    if (!popup) return
    bringSessionPopupToFront(sessionId)
    gestureRef.current = {
      pointerId, mode, sessionId,
      startClientX: clientX, startClientY: clientY,
      startX: popup.x, startY: popup.y,
      startWidth: popup.width, startHeight: popup.height,
      snapTarget: null,
    }
  }

  function startMoveFromHeader(sessionId: string, event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return
    const target = event.target instanceof HTMLElement ? event.target : null
    if (target?.closest('button,a,input,textarea,select,[role="button"],[role="tab"]')) return
    event.preventDefault()
    startGesture('move', sessionId, event.pointerId, event.clientX, event.clientY)
  }

  useEffect(() => {
    function handlePointerMove(event: PointerEvent): void {
      const gesture = gestureRef.current
      if (!gesture || event.pointerId !== gesture.pointerId) return

      const hostBounds = containerRef.current?.getBoundingClientRect()
      const hostWidth = hostBounds?.width ?? window.innerWidth
      const hostHeight = hostBounds?.height ?? window.innerHeight
      const dx = event.clientX - gesture.startClientX
      const dy = event.clientY - gesture.startClientY

      if (gesture.mode === 'move') {
        const maxX = Math.max(POPUP_MARGIN, hostWidth - gesture.startWidth - POPUP_MARGIN)
        const maxY = Math.max(POPUP_MARGIN, hostHeight - gesture.startHeight - POPUP_DOCK_RESERVE)
        const x = Math.min(maxX, Math.max(POPUP_MARGIN, gesture.startX + dx))
        const y = Math.min(maxY, Math.max(POPUP_MARGIN, gesture.startY + dy))
        setSessionPopupRect(gesture.sessionId, { x, y })
        const relX = event.clientX - (hostBounds?.left ?? 0)
        const relY = event.clientY - (hostBounds?.top ?? 0)
        const zone = detectSnapZone(relX, relY, hostWidth, hostHeight)
        const target = zone
          ? { zone, ...computeSnapRect(zone, hostWidth, hostHeight, POPUP_MARGIN, POPUP_DOCK_RESERVE) }
          : null
        gesture.snapTarget = target
        setSnapGhost(target)
        return
      }

      const dir = gesture.mode.slice(7) as ResizeDir
      let x = gesture.startX
      let y = gesture.startY
      let w = gesture.startWidth
      let h = gesture.startHeight
      if (dir.includes('e')) w = Math.min(Math.max(POPUP_MIN_WIDTH, w + dx), hostWidth - x - POPUP_MARGIN)
      if (dir.includes('w')) {
        const nx = Math.min(Math.max(POPUP_MARGIN, x + dx), x + w - POPUP_MIN_WIDTH)
        w = x + w - nx; x = nx
      }
      if (dir.includes('s')) h = Math.min(Math.max(POPUP_MIN_HEIGHT, h + dy), hostHeight - y - POPUP_DOCK_RESERVE)
      if (dir.includes('n')) {
        const ny = Math.min(Math.max(POPUP_MARGIN, y + dy), y + h - POPUP_MIN_HEIGHT)
        h = y + h - ny; y = ny
      }
      setSessionPopupRect(gesture.sessionId, { x, y, width: w, height: h })
    }

    function handlePointerUp(event: PointerEvent): void {
      const gesture = gestureRef.current
      if (!gesture || event.pointerId !== gesture.pointerId) return
      if (gesture.mode === 'move' && gesture.snapTarget) {
        const { zone, x, y, width, height } = gesture.snapTarget
        setSessionPopupRect(gesture.sessionId, { x, y, width, height, snapZone: zone })
      }
      setSnapGhost(null)
      gestureRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [setSessionPopupRect])

  if (orderedPopupSessionIds.length === 0) return null

  return createPortal(
    <div
      ref={containerRef}
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 9000 }}
    >
      {/* Snap ghost */}
      {snapGhost && (
        <div
          className="pointer-events-none absolute cockpit-frame-full"
          style={{
            left: snapGhost.x, top: snapGhost.y,
            width: snapGhost.width, height: snapGhost.height,
            zIndex: 65,
            border: '2px dashed var(--color-cockpit-cyan)',
            background: 'color-mix(in srgb, var(--color-cockpit-cyan) 6%, transparent)',
            boxShadow: '0 0 24px color-mix(in srgb, var(--color-cockpit-cyan) 18%, transparent)',
            transition: 'left 0.1s ease, top 0.1s ease, width 0.1s ease, height 0.1s ease',
          }}
        >
          <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
          <span className="cockpit-corner cockpit-corner-tr" aria-hidden />
          <span className="cockpit-corner cockpit-corner-bl" aria-hidden />
          <span className="cockpit-corner cockpit-corner-br" aria-hidden />
        </div>
      )}

      {/* Popup windows */}
      {orderedPopupSessionIds.map((sessionId, orderIndex) => {
        const popup = popupWindows[sessionId]
        if (!popup || popup.minimized) return null
        const zIndex = 9070 + orderIndex

        const snapLayout = (zone: SnapZone) => {
          const hb = containerRef.current?.getBoundingClientRect()
          const rect = computeSnapRect(
            zone,
            hb?.width ?? window.innerWidth,
            hb?.height ?? window.innerHeight,
            POPUP_MARGIN,
            POPUP_DOCK_RESERVE,
          )
          setSessionPopupRect(sessionId, { ...rect, snapZone: zone })
        }

        return (
          <div
            key={sessionId}
            className="pointer-events-auto absolute overflow-hidden rounded-2xl"
            style={{ left: popup.x, top: popup.y, width: popup.width, height: popup.height, zIndex }}
            onMouseDown={() => bringSessionPopupToFront(sessionId)}
            data-testid={`popup-window-${sessionId}`}
          >
            <InstancePopupHub
              inline
              open={true}
              sessionId={sessionId}
              preferredTab={popup.preferredTab}
              onPreferredTabConsumed={() => clearSessionPopupPreferredTab(sessionId)}
              onClose={() => closeSessionPopup(sessionId)}
              onMinimize={() => minimizeSessionPopup(sessionId)}
              onFocus={() => bringSessionPopupToFront(sessionId)}
              onSnapLayout={snapLayout}
              onHeaderPointerDown={(event) => startMoveFromHeader(sessionId, event)}
            />
            <div className="absolute inset-x-2 bottom-0 h-1.5 cursor-s-resize z-40"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); startGesture('resize-s', sessionId, e.pointerId, e.clientX, e.clientY) }} />
            <div className="absolute inset-y-2 left-0 w-1.5 cursor-w-resize z-40"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); startGesture('resize-w', sessionId, e.pointerId, e.clientX, e.clientY) }} />
            <div className="absolute inset-y-2 right-0 w-1.5 cursor-e-resize z-40"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); startGesture('resize-e', sessionId, e.pointerId, e.clientX, e.clientY) }} />
            <div className="absolute top-0 left-0 h-3 w-3 cursor-nw-resize z-[41]"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); startGesture('resize-nw', sessionId, e.pointerId, e.clientX, e.clientY) }} />
            <div className="absolute top-0 right-0 h-3 w-3 cursor-ne-resize z-[41]"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); startGesture('resize-ne', sessionId, e.pointerId, e.clientX, e.clientY) }} />
            <div className="absolute bottom-0 left-0 h-3 w-3 cursor-sw-resize z-[41]"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); startGesture('resize-sw', sessionId, e.pointerId, e.clientX, e.clientY) }} />
            <div
              className="absolute bottom-0 right-0 z-[41] h-5 w-5 cursor-nwse-resize border-l border-t border-border/70 bg-[color-mix(in_srgb,var(--color-cockpit-accent)_10%,transparent)] text-[10px] text-muted-foreground flex items-center justify-center"
              aria-label={`Resize popup ${popupLabel(sessionId)}`}
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                startGesture('resize-se', sessionId, event.pointerId, event.clientX, event.clientY)
              }}
            >
              ◢
            </div>
          </div>
        )
      })}

      {/* Dock bar */}
      <div className="pointer-events-auto absolute bottom-2 left-1/2 -translate-x-1/2" data-testid="popup-dock-bar">
        <div className="cockpit-frame-full flex max-w-[min(92vw,1120px)] items-center gap-2 overflow-x-auto border border-[color-mix(in_srgb,var(--color-cockpit-accent)_35%,var(--color-border))] bg-[var(--color-panel-surface)] px-3 py-1.5">
          <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
          <span className="cockpit-corner cockpit-corner-tr" aria-hidden />
          <span className="shrink-0 [font-family:var(--font-mono-data)] text-[9px] uppercase tracking-[0.16em] text-[var(--color-cockpit-dim)] pr-1 select-none">
            Open Agents
          </span>
          <span className="shrink-0 w-px h-4 bg-border/50" aria-hidden />
          {orderedPopupSessionIds.map((sessionId) => {
            const popup = popupWindows[sessionId]
            if (!popup) return null
            const minimized = popup.minimized
            const focused = selectedSessionId === sessionId && !minimized
            return (
              <div key={sessionId} className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className={`flex items-center gap-1.5 border px-2 py-1 [font-family:var(--font-mono-data)] text-[10px] uppercase tracking-[0.12em] transition-colors ${
                    focused
                      ? 'border-[color-mix(in_srgb,var(--color-cockpit-amber)_70%,transparent)] bg-[color-mix(in_srgb,var(--color-cockpit-amber)_12%,transparent)] text-[var(--color-cockpit-amber)]'
                      : minimized
                        ? 'border-[color-mix(in_srgb,var(--color-cockpit-accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-cockpit-accent)_8%,transparent)] text-muted-foreground hover:text-foreground hover:border-[color-mix(in_srgb,var(--color-cockpit-accent)_65%,transparent)]'
                        : 'border-[color-mix(in_srgb,var(--color-cockpit-accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-cockpit-accent)_8%,transparent)] text-foreground hover:border-[color-mix(in_srgb,var(--color-cockpit-accent)_65%,transparent)]'
                  }`}
                  onClick={() => minimized ? restoreSessionPopup(sessionId) : bringSessionPopupToFront(sessionId)}
                  data-testid={`popup-dock-${sessionId}`}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" aria-hidden />
                  <span className="truncate max-w-40">{popupLabel(sessionId)}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Close popup ${popupLabel(sessionId)}`}
                  className="inline-flex h-4 w-4 items-center justify-center border border-red-500/40 text-[9px] text-red-300 hover:bg-red-500/20"
                  onClick={(event) => { event.stopPropagation(); closeSessionPopup(sessionId) }}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
