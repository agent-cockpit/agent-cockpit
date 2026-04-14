import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

let dialogOnOpenChange: ((open: boolean) => void) | null = null

vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    children: React.ReactNode
  }) => {
    dialogOnOpenChange = onOpenChange
    return open ? <div data-testid="menu-dialog-root">{children}</div> : null
  },
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Overlay: () => <div data-testid="menu-dialog-overlay" />,
  Content: ({ children }: { children: React.ReactNode }) => <div data-testid="menu-dialog-content">{children}</div>,
  Close: ({ children }: { children: React.ReactNode }) => (
    <button aria-label="Close menu" onClick={() => dialogOnOpenChange?.(false)}>{children}</button>
  ),
  Title: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

const mockRefs = vi.hoisted(() => ({
  setMuted: vi.fn(),
  setMusicVolume: vi.fn(),
  setSfxVolume: vi.fn(),
  playPopupToggle: vi.fn(),
}))

vi.mock('../../../audio/audioSystem.js', () => ({
  useAudioSettings: () => ({
    muted: false,
    musicVolume: 0.55,
    sfxVolume: 0.8,
  }),
  audioSystem: {
    setMuted: mockRefs.setMuted,
    setMusicVolume: mockRefs.setMusicVolume,
    setSfxVolume: mockRefs.setSfxVolume,
    playPopupToggle: mockRefs.playPopupToggle,
  },
}))

import { MenuPopup } from '../MenuPopup.js'

describe('MenuPopup', () => {
  beforeEach(() => {
    mockRefs.setMuted.mockReset()
    mockRefs.setMusicVolume.mockReset()
    mockRefs.setSfxVolume.mockReset()
    mockRefs.playPopupToggle.mockReset()
  })

  it('renders nothing when closed', () => {
    const { queryByTestId } = render(<MenuPopup open={false} onClose={vi.fn()} />)
    expect(queryByTestId('menu-dialog-root')).toBeNull()
  })

  it('renders audio controls when open', () => {
    render(<MenuPopup open={true} onClose={vi.fn()} />)
    expect(screen.getByTestId('menu-dialog-content')).toBeInTheDocument()
    expect(screen.getByText('Game Menu')).toBeInTheDocument()
    expect(screen.getByLabelText('Music volume')).toBeInTheDocument()
    expect(screen.getByLabelText('SFX volume')).toBeInTheDocument()
  })

  it('forwards audio control interactions', () => {
    render(<MenuPopup open={true} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /mute audio/i }))
    expect(mockRefs.setMuted).toHaveBeenCalledWith(true)

    fireEvent.change(screen.getByLabelText('Music volume'), { target: { value: '64' } })
    expect(mockRefs.setMusicVolume).toHaveBeenCalledWith(0.64)

    fireEvent.change(screen.getByLabelText('SFX volume'), { target: { value: '37' } })
    expect(mockRefs.setSfxVolume).toHaveBeenCalledWith(0.37)
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<MenuPopup open={true} onClose={onClose} />)

    fireEvent.click(screen.getByLabelText('Close menu'))
    expect(onClose).toHaveBeenCalled()
  })
})
