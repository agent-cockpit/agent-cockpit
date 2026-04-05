import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useStore } from '../store/index.js'
import { SessionFilters } from '../components/sessions/SessionFilters.js'

beforeEach(() => {
  useStore.setState({
    filters: { provider: null, status: null, search: '' },
  })
})

describe('SessionFilters', () => {
  it('renders provider filter dropdown with options all, claude, codex', () => {
    render(<SessionFilters />)
    const providerSelect = screen.getByLabelText(/provider/i)
    expect(providerSelect).toBeInTheDocument()
    // Use getAllByRole since both provider and status selects have an 'all' option
    const allOptions = screen.getAllByRole('option', { name: /all/i })
    expect(allOptions.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('option', { name: 'claude' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'codex' })).toBeInTheDocument()
  })

  it('renders status filter dropdown with options all, active, ended', () => {
    render(<SessionFilters />)
    const statusSelect = screen.getByLabelText(/status/i)
    expect(statusSelect).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'active' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'ended' })).toBeInTheDocument()
  })

  it('renders search text input', () => {
    render(<SessionFilters />)
    const searchInput = screen.getByPlaceholderText(/search/i)
    expect(searchInput).toBeInTheDocument()
  })

  it('changing provider dropdown calls setFilter(provider, claude)', () => {
    const setFilterSpy = vi.fn()
    useStore.setState({ setFilter: setFilterSpy } as any)
    render(<SessionFilters />)
    const providerSelect = screen.getByLabelText(/provider/i)
    fireEvent.change(providerSelect, { target: { value: 'claude' } })
    expect(setFilterSpy).toHaveBeenCalledWith('provider', 'claude')
  })

  it('clearing provider dropdown calls setFilter(provider, null)', () => {
    const setFilterSpy = vi.fn()
    useStore.setState({ setFilter: setFilterSpy } as any)
    render(<SessionFilters />)
    const providerSelect = screen.getByLabelText(/provider/i)
    fireEvent.change(providerSelect, { target: { value: '' } })
    expect(setFilterSpy).toHaveBeenCalledWith('provider', null)
  })
})
