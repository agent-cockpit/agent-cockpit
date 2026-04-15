import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../store/index.js'

describe('wsSlice', () => {
  beforeEach(() => {
    // Reset store state before each test
    useStore.setState({
      wsStatus: 'disconnected',
      lastSeenSequence: 0,
    })
  })

  it('lastSeenSequence starts at 0', () => {
    expect(useStore.getState().lastSeenSequence).toBe(0)
  })

  it('setWsStatus transitions from disconnected to connected', () => {
    expect(useStore.getState().wsStatus).toBe('disconnected')
    useStore.getState().setWsStatus('connected')
    expect(useStore.getState().wsStatus).toBe('connected')
  })

  it('recordSequence updates lastSeenSequence', () => {
    useStore.getState().recordSequence(42)
    expect(useStore.getState().lastSeenSequence).toBe(42)
  })

  it('setWsStatus can transition through all states', () => {
    useStore.getState().setWsStatus('connecting')
    expect(useStore.getState().wsStatus).toBe('connecting')
    useStore.getState().setWsStatus('connected')
    expect(useStore.getState().wsStatus).toBe('connected')
    useStore.getState().setWsStatus('disconnected')
    expect(useStore.getState().wsStatus).toBe('disconnected')
  })
})
