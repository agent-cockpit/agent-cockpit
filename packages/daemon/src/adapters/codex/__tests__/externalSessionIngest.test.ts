import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../../../db/database.js'
import { getAllSessions } from '../../../db/queries.js'
import { ingestExternalCodexCliSessions } from '../externalSessionIngest.js'

const CLI_SESSION_ID = '11111111-1111-7111-8111-111111111111'
const CLI_SESSION_ID_2 = '22222222-2222-7222-8222-222222222222'
const VSCODE_SESSION_ID = '33333333-3333-7333-8333-333333333333'
const OLD_CLI_SESSION_ID = '44444444-4444-7444-8444-444444444444'

const tempRoots: string[] = []

function mktempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempRoots.push(dir)
  return dir
}

function createStateDb(codexHomePath: string, dbName = 'state_5.sqlite'): BetterSqlite3.Database {
  fs.mkdirSync(codexHomePath, { recursive: true })
  const dbPath = path.join(codexHomePath, dbName)
  const db = new BetterSqlite3(dbPath)
  db.exec(`
    CREATE TABLE threads (
      id TEXT PRIMARY KEY,
      cwd TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      source TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0
    );
  `)
  return db
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop()
    if (!dir) continue
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('ingestExternalCodexCliSessions', () => {
  it('imports recent external codex sessions from cli and vscode sources as approval-only', () => {
    const daemonDb = openDatabase(':memory:')
    const codexHomePath = mktempDir('codex-home-')
    const stateDb = createStateDb(codexHomePath)
    const nowSec = Math.floor(Date.now() / 1000)

    stateDb.prepare(
      'INSERT INTO threads (id, cwd, created_at, updated_at, source, archived) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(CLI_SESSION_ID, '/workspace/cli', nowSec, nowSec, 'cli', 0)
    stateDb.prepare(
      'INSERT INTO threads (id, cwd, created_at, updated_at, source, archived) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(VSCODE_SESSION_ID, '/workspace/vscode', nowSec, nowSec, 'vscode', 0)
    stateDb.prepare(
      'INSERT INTO threads (id, cwd, created_at, updated_at, source, archived) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(CLI_SESSION_ID_2, '/workspace/archived-cli', nowSec, nowSec, 'cli', 1)
    stateDb.prepare(
      'INSERT INTO threads (id, cwd, created_at, updated_at, source, archived) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(OLD_CLI_SESSION_ID, '/workspace/old-cli', nowSec - 100_000, nowSec - 100_000, 'cli', 0)
    stateDb.close()

    const imported = ingestExternalCodexCliSessions(daemonDb, undefined, { codexHomePath, lookbackSeconds: 3600 })
    expect(imported).toBe(2)

    const sessions = getAllSessions(daemonDb)
    expect(sessions.length).toBe(2)
    const byId = new Map(sessions.map((s) => [s.sessionId, s]))

    const cliSummary = byId.get(CLI_SESSION_ID)
    expect(cliSummary?.provider).toBe('codex')
    expect(cliSummary?.workspacePath).toBe('/workspace/cli')
    expect(cliSummary?.capabilities).toEqual({
      managedByDaemon: false,
      canSendMessage: false,
      canTerminateSession: false,
      reason: 'External session is approval-only; chat send and terminate are disabled.',
    })

    const vscodeSummary = byId.get(VSCODE_SESSION_ID)
    expect(vscodeSummary?.provider).toBe('codex')
    expect(vscodeSummary?.workspacePath).toBe('/workspace/vscode')
    expect(vscodeSummary?.capabilities).toEqual({
      managedByDaemon: false,
      canSendMessage: false,
      canTerminateSession: false,
      reason: 'External session is approval-only; chat send and terminate are disabled.',
    })

    expect(byId.has(CLI_SESSION_ID_2)).toBe(false)
    expect(byId.has(OLD_CLI_SESSION_ID)).toBe(false)

    daemonDb.close()
  })

  it('is idempotent across repeated polling calls', () => {
    const daemonDb = openDatabase(':memory:')
    const codexHomePath = mktempDir('codex-home-')
    const stateDb = createStateDb(codexHomePath)
    const nowSec = Math.floor(Date.now() / 1000)

    stateDb.prepare(
      'INSERT INTO threads (id, cwd, created_at, updated_at, source, archived) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(CLI_SESSION_ID_2, '/workspace/cli-2', nowSec, nowSec, 'cli', 0)
    stateDb.close()

    const firstImportCount = ingestExternalCodexCliSessions(daemonDb, undefined, { codexHomePath, lookbackSeconds: 3600 })
    const secondImportCount = ingestExternalCodexCliSessions(daemonDb, undefined, { codexHomePath, lookbackSeconds: 3600 })
    expect(firstImportCount).toBe(1)
    expect(secondImportCount).toBe(0)

    const startEventCount = daemonDb.prepare(
      "SELECT COUNT(*) AS count FROM events WHERE session_id = ? AND type = 'session_start'",
    ).get(CLI_SESSION_ID_2) as { count: number }
    expect(startEventCount.count).toBe(1)

    daemonDb.close()
  })

  it('returns zero when CODEX_HOME has no state db', () => {
    const daemonDb = openDatabase(':memory:')
    const codexHomePath = mktempDir('codex-home-empty-')

    const imported = ingestExternalCodexCliSessions(daemonDb, undefined, { codexHomePath, lookbackSeconds: 3600 })
    expect(imported).toBe(0)

    daemonDb.close()
  })

  it('does not import external thread ids that belong to managed Codex sessions', () => {
    const daemonDb = openDatabase(':memory:')
    const codexHomePath = mktempDir('codex-home-managed-thread-')
    const stateDb = createStateDb(codexHomePath)
    const nowSec = Math.floor(Date.now() / 1000)

    stateDb.prepare(
      'INSERT INTO threads (id, cwd, created_at, updated_at, source, archived) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(CLI_SESSION_ID, '/workspace/managed-thread', nowSec, nowSec, 'cli', 0)
    stateDb.close()

    daemonDb.prepare(
      'INSERT INTO codex_sessions (session_id, thread_id, workspace, created_at) VALUES (?, ?, ?, ?)',
    ).run('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', CLI_SESSION_ID, '/workspace/managed-thread', new Date().toISOString())

    const imported = ingestExternalCodexCliSessions(daemonDb, undefined, { codexHomePath, lookbackSeconds: 3600 })
    expect(imported).toBe(0)

    const startEventCount = daemonDb.prepare(
      "SELECT COUNT(*) AS count FROM events WHERE session_id = ? AND type = 'session_start'",
    ).get(CLI_SESSION_ID) as { count: number }
    expect(startEventCount.count).toBe(0)

    daemonDb.close()
  })
})
