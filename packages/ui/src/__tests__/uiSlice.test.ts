import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../store/index.js'

beforeEach(() => {
  useStore.setState({
    selectedSessionId: null,
    activePanel: 'approvals',
    sessions: {},
  })
})

describe('uiSlice', () => {
  it('initial selectedSessionId is null', () => {
    expect(useStore.getState().selectedSessionId).toBeNull()
  })

  it('initial activePanel is approvals', () => {
    expect(useStore.getState().activePanel).toBe('approvals')
  })

  it('selectSession sets selectedSessionId', () => {
    useStore.getState().selectSession('session-abc')
    expect(useStore.getState().selectedSessionId).toBe('session-abc')
  })

  it('setActivePanel sets activePanel', () => {
    useStore.getState().setActivePanel('timeline')
    expect(useStore.getState().activePanel).toBe('timeline')
  })

  it('selecting a different session does NOT reset activePanel (OPS-03 — per-session state preserved)', () => {
    useStore.getState().selectSession('session-1')
    useStore.getState().setActivePanel('diff')
    expect(useStore.getState().activePanel).toBe('diff')

    // Select a different session — activePanel must remain 'diff'
    useStore.getState().selectSession('session-2')
    expect(useStore.getState().selectedSessionId).toBe('session-2')
    expect(useStore.getState().activePanel).toBe('diff')
  })
})
