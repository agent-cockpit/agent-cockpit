import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

const mockDialogOnOpenChange = vi.fn()
vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode }) => {
    mockDialogOnOpenChange.mockImplementation(onOpenChange)
    return open ? <div data-testid="dialog-root">{children}</div> : null
  },
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Overlay: () => <div />,
  Content: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-content">{children}</div>,
  Close: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
    <button {...props} onClick={() => mockDialogOnOpenChange(false)}>{children}</button>,
  Title: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

vi.mock('../../../pages/HistoryPage.js', () => ({
  HistoryPage: () => <div data-testid="history-page-content">History Content</div>,
}))

import { HistoryPopup } from '../HistoryPopup.js'

describe('HistoryPopup', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(<HistoryPopup open={false} onClose={vi.fn()} />)
    expect(container.querySelector('[data-testid="dialog-root"]')).toBeNull()
  })

  it('renders Dialog when open=true', () => {
    render(<HistoryPopup open={true} onClose={vi.fn()} />)
    expect(screen.getByTestId('dialog-content')).toBeInTheDocument()
  })

  it('renders HistoryPage content inside modal', () => {
    render(<HistoryPopup open={true} onClose={vi.fn()} />)
    expect(screen.getByTestId('history-page-content')).toBeInTheDocument()
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(<HistoryPopup open={true} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(mockDialogOnOpenChange).toHaveBeenCalledWith(false)
    expect(onClose).toHaveBeenCalled()
  })
})
