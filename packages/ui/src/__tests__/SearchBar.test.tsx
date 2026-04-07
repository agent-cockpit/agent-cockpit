import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SearchBar } from '../components/search/SearchBar.js'

const mockResult = {
  sourceType: 'event' as const,
  sourceId: 'evt-1',
  sessionId: 'sess-1',
  snippet: 'A <b>matching</b> snippet',
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve([mockResult]),
      }),
    ),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('SearchBar', () => {
  it('renders an input with placeholder text', () => {
    render(<SearchBar />)
    expect(screen.getByTestId('search-input')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/search sessions/i)).toBeInTheDocument()
  })

  it('typing a query triggers fetch to /api/search?q=... after 300ms debounce', async () => {
    render(<SearchBar />)
    const input = screen.getByTestId('search-input')
    fireEvent.change(input, { target: { value: 'hello' } })

    // Before 300ms: no fetch
    expect(global.fetch).not.toHaveBeenCalled()

    // Advance timers by 300ms
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(global.fetch).toHaveBeenCalledOnce()
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/search?q=hello'),
    )
  })

  it('returned results are rendered — each SearchResult shows sourceType and snippet', async () => {
    render(<SearchBar />)
    const input = screen.getByTestId('search-input')
    fireEvent.change(input, { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
      // Flush promises
      await Promise.resolve()
    })

    expect(screen.getByTestId('search-results')).toBeInTheDocument()
    expect(screen.getByText('event')).toBeInTheDocument()
  })

  it('empty query clears results without fetching', async () => {
    render(<SearchBar />)
    const input = screen.getByTestId('search-input')

    // First type something to get results
    fireEvent.change(input, { target: { value: 'hello' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })
    expect(screen.getByTestId('search-results')).toBeInTheDocument()

    // Then clear
    vi.clearAllMocks()
    fireEvent.change(input, { target: { value: '' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(screen.queryByTestId('search-results')).not.toBeInTheDocument()
  })

  it('component cleans up timer on unmount (no act() warning)', () => {
    const { unmount } = render(<SearchBar />)
    const input = screen.getByTestId('search-input')
    fireEvent.change(input, { target: { value: 'partial' } })
    // Unmount before debounce fires — should not cause warnings
    unmount()
    vi.advanceTimersByTime(300)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
