import { describe, it, expect, beforeEach, vi } from 'vitest'

const PLAYER_CHARACTER_STORAGE_KEY = 'cockpit.player.character.v1'

async function loadStore() {
  vi.resetModules()
  return import('../store/index.js')
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('uiSlice', () => {
  it('initial selectedSessionId is null', async () => {
    const { useStore } = await loadStore()
    expect(useStore.getState().selectedSessionId).toBeNull()
  })

  it('initial activePanel is approvals', async () => {
    const { useStore } = await loadStore()
    expect(useStore.getState().activePanel).toBe('approvals')
  })

  it('initial selectedPlayerCharacter defaults to astronaut when storage is empty', async () => {
    const { useStore } = await loadStore()
    expect(useStore.getState().selectedPlayerCharacter).toBe('astronaut')
  })

  it('restores selectedPlayerCharacter from localStorage when value is valid', async () => {
    window.localStorage.setItem(PLAYER_CHARACTER_STORAGE_KEY, 'ninja')

    const { useStore } = await loadStore()

    expect(useStore.getState().selectedPlayerCharacter).toBe('ninja')
  })

  it('falls back to astronaut when localStorage contains an invalid character', async () => {
    window.localStorage.setItem(PLAYER_CHARACTER_STORAGE_KEY, 'wizard')

    const { useStore } = await loadStore()

    expect(useStore.getState().selectedPlayerCharacter).toBe('astronaut')
  })

  it('selectSession sets selectedSessionId', async () => {
    const { useStore } = await loadStore()
    useStore.getState().selectSession('session-abc')
    expect(useStore.getState().selectedSessionId).toBe('session-abc')
  })

  it('setActivePanel sets activePanel', async () => {
    const { useStore } = await loadStore()
    useStore.getState().setActivePanel('timeline')
    expect(useStore.getState().activePanel).toBe('timeline')
  })

  it('setSelectedPlayerCharacter updates store state and persists the raw character string', async () => {
    const { useStore } = await loadStore()

    useStore.getState().setSelectedPlayerCharacter('pirate')

    expect(useStore.getState().selectedPlayerCharacter).toBe('pirate')
    expect(window.localStorage.getItem(PLAYER_CHARACTER_STORAGE_KEY)).toBe('pirate')
  })

  it('selecting a different session does NOT reset activePanel (OPS-03 — per-session state preserved)', async () => {
    const { useStore } = await loadStore()
    useStore.getState().selectSession('session-1')
    useStore.getState().setActivePanel('diff')
    expect(useStore.getState().activePanel).toBe('diff')

    // Select a different session — activePanel must remain 'diff'
    useStore.getState().selectSession('session-2')
    expect(useStore.getState().selectedSessionId).toBe('session-2')
    expect(useStore.getState().activePanel).toBe('diff')
  })
})
