import { beforeEach, describe, expect, it, vi } from 'vitest'

const SESSION_CHARACTER_STORAGE_KEY = 'cockpit.session.characters.v1'
const SESSION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

async function loadStore() {
  vi.resetModules()
  return import('../store/index.js')
}

describe('store session character persistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('reuses persisted character for known session ids', async () => {
    window.localStorage.setItem(
      SESSION_CHARACTER_STORAGE_KEY,
      JSON.stringify({ [SESSION_ID]: 'robot' }),
    )

    const { useStore } = await loadStore()
    useStore.getState().applyEvent({
      type: 'session_start',
      sessionId: SESSION_ID,
      provider: 'claude',
      workspacePath: '/tmp/foo',
      timestamp: '2026-01-01T00:00:00.000Z',
      schemaVersion: 1,
    })

    expect(useStore.getState().sessions[SESSION_ID]?.character).toBe('robot')
  })

  it('does not change character on duplicate session_start for the same session', async () => {
    const { useStore } = await loadStore()

    useStore.getState().applyEvent({
      type: 'session_start',
      sessionId: SESSION_ID,
      provider: 'codex',
      workspacePath: '/tmp/foo',
      timestamp: '2026-01-01T00:00:00.000Z',
      schemaVersion: 1,
    })
    const initialCharacter = useStore.getState().sessions[SESSION_ID]?.character

    useStore.getState().applyEvent({
      type: 'session_start',
      sessionId: SESSION_ID,
      provider: 'codex',
      workspacePath: '/tmp/foo-renamed',
      timestamp: '2026-01-01T00:05:00.000Z',
      schemaVersion: 1,
    })
    const afterDuplicateCharacter = useStore.getState().sessions[SESSION_ID]?.character

    expect(afterDuplicateCharacter).toBe(initialCharacter)
  })

  it('removes stored character mapping when session ends', async () => {
    const { useStore } = await loadStore()

    useStore.getState().applyEvent({
      type: 'session_start',
      sessionId: SESSION_ID,
      provider: 'claude',
      workspacePath: '/tmp/foo',
      timestamp: '2026-01-01T00:00:00.000Z',
      schemaVersion: 1,
    })
    useStore.getState().applyEvent({
      type: 'session_end',
      sessionId: SESSION_ID,
      provider: 'claude',
      timestamp: '2026-01-01T00:10:00.000Z',
      schemaVersion: 1,
    })

    const stored = window.localStorage.getItem(SESSION_CHARACTER_STORAGE_KEY)
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored ?? '{}') as Record<string, string>
    expect(parsed[SESSION_ID]).toBeUndefined()
  })
})
