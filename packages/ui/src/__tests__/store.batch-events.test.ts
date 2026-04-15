import { describe, it, expect, vi } from 'vitest'
import type { NormalizedEvent } from '@cockpit/shared'

async function loadStore() {
  vi.resetModules()
  return import('../store/index.js')
}

function makeEvent(overrides: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    schemaVersion: 1,
    sessionId: '11111111-1111-1111-1111-111111111111',
    timestamp: '2026-01-01T00:00:00.000Z',
    type: 'session_start',
    provider: 'claude',
    workspacePath: '/tmp/workspace',
    ...overrides,
  } as NormalizedEvent
}

describe('store batch event reducer', () => {
  it('applyEventsBatch reaches the same final session state as sequential applyEvent', async () => {
    const seqStartEnded = makeEvent({
      sequenceNumber: 1,
      sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      timestamp: '2026-01-01T00:00:01.000Z',
      type: 'session_start',
      provider: 'claude',
      workspacePath: '/tmp/ended-a',
    })
    const seqStartActive = makeEvent({
      sequenceNumber: 2,
      sessionId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      timestamp: '2026-01-01T00:00:02.000Z',
      type: 'session_start',
      provider: 'codex',
      workspacePath: '/tmp/active-b',
    })
    const seqEndEnded = makeEvent({
      sequenceNumber: 3,
      sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      timestamp: '2026-01-01T00:00:03.000Z',
      type: 'session_end',
      provider: 'claude',
      exitCode: 0,
    })

    const events = [seqStartEnded, seqStartActive, seqEndEnded]

    const { useStore: storeBatch } = await loadStore()
    storeBatch.getState().applyEventsBatch(events)
    const batchSessions = storeBatch.getState().sessions

    const { useStore: storeSequential } = await loadStore()
    events.forEach((event) => storeSequential.getState().applyEvent(event))
    const sequentialSessions = storeSequential.getState().sessions

    const stripCharacter = (sessions: typeof batchSessions) =>
      Object.fromEntries(
        Object.entries(sessions).map(([sessionId, session]) => [
          sessionId,
          { ...session, character: undefined },
        ]),
      )

    expect(stripCharacter(batchSessions)).toEqual(stripCharacter(sequentialSessions))
    expect(batchSessions['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']?.status).toBe('active')
    expect(batchSessions['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']?.status).toBe('ended')
  })
})
