import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type BetterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../../../db/database.js'
import { persistEvent, setClaudeSessionId } from '../../../db/queries.js'
import { setClaudeSessionCache, setClaudeSessionDb } from '../hookParser.js'
import { ingestExternalClaudeSessions } from '../externalSessionIngest.js'

const tempRoots: string[] = []

function mktempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempRoots.push(dir)
  return dir
}

function writeSessionFile(
  sessionsPath: string,
  name: string,
  data: { pid: number; sessionId: string; cwd: string; startedAt: number },
): void {
  fs.mkdirSync(sessionsPath, { recursive: true })
  fs.writeFileSync(path.join(sessionsPath, `${name}.json`), JSON.stringify(data), 'utf8')
}

function countEvents(db: BetterSqlite3.Database, type: 'session_start' | 'session_end'): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM events WHERE type = ?').get(type) as { count: number }
  return row.count
}

describe('ingestExternalClaudeSessions', () => {
  let db: BetterSqlite3.Database

  beforeEach(() => {
    db = openDatabase(':memory:')
    setClaudeSessionDb(db)
    setClaudeSessionCache(new Map())
  })

  afterEach(() => {
    setClaudeSessionDb(null)
    setClaudeSessionCache(new Map())
    db.close()

    while (tempRoots.length > 0) {
      const dir = tempRoots.pop()
      if (!dir) continue
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not auto-close sessions when pid probe is unknown', () => {
    const sessionsPath = mktempDir('claude-sessions-')
    writeSessionFile(sessionsPath, 'external-unknown', {
      pid: 4242,
      sessionId: 'external-unknown',
      cwd: '/workspace/external',
      startedAt: Date.now(),
    })

    const firstImport = ingestExternalClaudeSessions(db, undefined, {
      sessionsPath,
      probePid: () => 'unknown',
    })
    const secondImport = ingestExternalClaudeSessions(db, undefined, {
      sessionsPath,
      probePid: () => 'unknown',
    })

    expect(firstImport).toBe(1)
    expect(secondImport).toBe(0)
    expect(countEvents(db, 'session_start')).toBe(1)
    expect(countEvents(db, 'session_end')).toBe(0)
  })

  it('emits session_end when external session pid is definitively dead', () => {
    const sessionsPath = mktempDir('claude-sessions-')
    writeSessionFile(sessionsPath, 'external-dead', {
      pid: 5252,
      sessionId: 'external-dead',
      cwd: '/workspace/external',
      startedAt: Date.now(),
    })

    const firstImport = ingestExternalClaudeSessions(db, undefined, {
      sessionsPath,
      probePid: () => 'alive',
    })
    const secondImport = ingestExternalClaudeSessions(db, undefined, {
      sessionsPath,
      probePid: () => 'dead',
    })

    expect(firstImport).toBe(1)
    expect(secondImport).toBe(0)
    expect(countEvents(db, 'session_start')).toBe(1)
    expect(countEvents(db, 'session_end')).toBe(1)
  })

  it('never auto-closes daemon-managed sessions from external pid polling', () => {
    const managedSessionId = 'managed-session-1'
    setClaudeSessionId(db, managedSessionId, managedSessionId, '/workspace/managed')
    persistEvent(db, {
      schemaVersion: 1,
      sessionId: managedSessionId,
      timestamp: new Date().toISOString(),
      type: 'session_start',
      provider: 'claude',
      workspacePath: '/workspace/managed',
      managedByDaemon: true,
      canSendMessage: true,
      canTerminateSession: true,
    })

    const sessionsPath = mktempDir('claude-sessions-')
    writeSessionFile(sessionsPath, 'managed', {
      pid: 6262,
      sessionId: managedSessionId,
      cwd: '/workspace/managed',
      startedAt: Date.now(),
    })

    const imported = ingestExternalClaudeSessions(db, undefined, {
      sessionsPath,
      probePid: () => 'dead',
    })

    expect(imported).toBe(0)
    expect(countEvents(db, 'session_start')).toBe(1)
    expect(countEvents(db, 'session_end')).toBe(0)
  })
})
