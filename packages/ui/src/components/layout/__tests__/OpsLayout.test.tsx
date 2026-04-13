import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('react-router', () => ({
  Outlet: () => <div data-testid="outlet" />,
}))

vi.mock('../MapSidebar.js', () => ({
  MapSidebar: ({ onFocusSession }: { onFocusSession: (sessionId: string) => void }) => (
    <button data-testid="map-sidebar" onClick={() => onFocusSession('sess-1')}>
      Map Sidebar
    </button>
  ),
}))

vi.mock('../../../pages/OfficePage.js', () => ({
  scrollToSession: vi.fn(),
}))

vi.mock('../../office/HistoryPopup.js', () => ({
  HistoryPopup: ({ open }: { open: boolean }) => (
    <div aria-label="Session History">{open ? 'open' : 'closed'}</div>
  ),
}))

import { OpsLayout } from '../OpsLayout.js'

function setupMatchMedia(isDesktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(min-width: 1024px)' ? isDesktop : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

function getSidebar() {
  return screen.getByTestId('ops-sidebar')
}

function dragResize(clientXStart: number, clientXMove: number) {
  const handle = screen.getByRole('separator', { name: /resize sidebar/i })
  fireEvent.pointerDown(handle, { clientX: clientXStart, pointerId: 1 })
  fireEvent.pointerMove(window, { clientX: clientXMove, pointerId: 1 })
  fireEvent.pointerUp(window, { pointerId: 1 })
}

function renderLayout(ui: ReactNode = <OpsLayout />) {
  render(<>{ui}</>)
}

describe('OpsLayout', () => {
  beforeEach(() => {
    localStorage.clear()
    setupMatchMedia(true)
  })

  it('reads initial sidebar width from localStorage key cockpit.sidebar.width', () => {
    localStorage.setItem('cockpit.sidebar.width', '340')

    renderLayout()

    expect(getSidebar()).toHaveStyle('width: 340px')
  })

  it('clamps desktop resize to max bound and persists clamped width', () => {
    localStorage.setItem('cockpit.sidebar.width', '340')
    renderLayout()

    dragResize(340, 520)

    expect(getSidebar()).toHaveStyle('width: 460px')
    expect(localStorage.getItem('cockpit.sidebar.width')).toBe('460')
  })

  it('clamps desktop resize to min bound', () => {
    localStorage.setItem('cockpit.sidebar.width', '340')
    renderLayout()

    dragResize(340, 120)

    expect(getSidebar()).toHaveStyle('width: 260px')
  })

  it('keeps history action clickable after resizing', () => {
    localStorage.setItem('cockpit.sidebar.width', '340')
    renderLayout()

    dragResize(340, 520)
    fireEvent.click(screen.getByRole('button', { name: /history/i }))

    expect(screen.getByLabelText('Session History')).toHaveTextContent('open')
  })

  it('does not expose interactive resize handle on narrow viewports', () => {
    setupMatchMedia(false)
    renderLayout()

    expect(screen.queryByRole('separator', { name: /resize sidebar/i })).not.toBeInTheDocument()
  })
})
