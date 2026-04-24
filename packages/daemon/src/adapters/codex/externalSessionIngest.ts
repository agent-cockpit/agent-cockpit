import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import type Database from 'better-sqlite3'
import type { NormalizedEvent } from '@cockpit/shared'
import { EXTERNAL_SESSION_REASON, persistEvent } from '../../db/queries.js'

type ExternalCodexThread = {
  sessionId: string
  workspacePath: string
  createdAt: number
}

export type ExternalCodexIngestOptions = {
  codexHomePath?: string
  lookbackSeconds?: number
}

function resolveCodexHomePath(explicitPath?: string): string {
  if (explicitPath && explicitPath.length > 0) return explicitPath
  if (process.env['CODEX_HOME'] && process.env['CODEX_HOME'].length > 0) {
    return process.env['CODEX_HOME']
  }
  return path.join(os.homedir(), '.codex')
}

function resolveLatestStateDbPath(codexHomePath: string): string | null {
  let entries: string[]
  try {
    entries = fs.readdirSync(codexHomePath)
  } catch {
    return null
  }

  const candidates = entries
    .filter((name) => /^state(_\d+)?\.sqlite$/.test(name))
    .map((name) => {
      const fullPath = path.join(codexHomePath, name)
      let mtimeMs = 0
      try {
        mtimeMs = fs.statSync(fullPath).mtimeMs
      } catch {
        mtimeMs = 0
      }
      return { fullPath, mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)

  return candidates[0]?.fullPath ?? null
}

function resolveLookbackSeconds(explicitSeconds?: number): number {
  if (typeof explicitSeconds === 'number' && Number.isFinite(explicitSeconds) && explicitSeconds > 0) {
    return explicitSeconds
  }
  const fromEnv = parseInt(process.env['COCKPIT_CODEX_EXTERNAL_LOOKBACK_SECONDS'] ?? '21600', 10)
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv
  return 21600
}

function normalizeTimestamp(secondsOrMs: number): string {
  const ms = secondsOrMs > 1_000_000_000_000 ? secondsOrMs : secondsOrMs * 1000
  return new Date(ms).toISOString()
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function readExternalSessions(stateDbPath: string, updatedAtCutoffSec: number): ExternalCodexThread[] {
  let stateDb: Database.Database | null = null
  try {
    stateDb = new BetterSqlite3(stateDbPath, { readonly: true, fileMustExist: true })

    const rows = stateDb.prepare(
      `SELECT id, cwd, created_at
       FROM threads
       WHERE source IN ('cli', 'vscode')
         AND archived = 0
         AND updated_at >= ?
       ORDER BY updated_at ASC`,
    ).all(updatedAtCutoffSec) as Array<{ id: string; cwd: string; created_at: number }>

    return rows
      .filter((row) => typeof row.id === 'string' && row.id.length > 0 && typeof row.cwd === 'string')
      .map((row) => ({
        sessionId: row.id,
        workspacePath: row.cwd,
        createdAt: row.created_at,
      }))
  } catch (err) {
    console.warn('[externalSessionIngest] Failed to read sessions from', stateDbPath, ':', err)
    return []
  } finally {
    stateDb?.close()
  }
}

function getKnownSessionStarts(db: Database.Database): Set<string> {
  const rows = db.prepare(
    `SELECT DISTINCT session_id
     FROM events
     WHERE type = 'session_start'`,
  ).all() as Array<{ session_id: string }>
  return new Set(rows.map((row) => row.session_id))
}

function getManagedCodexThreadIds(db: Database.Database): Set<string> {
  const rows = db.prepare(
    `SELECT DISTINCT thread_id
     FROM codex_sessions
     WHERE thread_id IS NOT NULL AND thread_id != ''`,
  ).all() as Array<{ thread_id: string }>
  return new Set(rows.map((row) => row.thread_id))
}

export function ingestExternalCodexCliSessions(
  db: Database.Database,
  emitEvent?: (event: NormalizedEvent) => void,
  options: ExternalCodexIngestOptions = {},
): number {
  const codexHomePath = resolveCodexHomePath(options.codexHomePath)
  const stateDbPath = resolveLatestStateDbPath(codexHomePath)
  if (!stateDbPath) return 0

  const lookbackSeconds = resolveLookbackSeconds(options.lookbackSeconds)
  const nowSec = Math.floor(Date.now() / 1000)
  const updatedAtCutoffSec = nowSec - lookbackSeconds
  const externalThreads = readExternalSessions(stateDbPath, updatedAtCutoffSec)
  if (externalThreads.length === 0) return 0

  const knownSessionStarts = getKnownSessionStarts(db)
  const managedThreadIds = getManagedCodexThreadIds(db)
  let imported = 0

  for (const thread of externalThreads) {
    if (!isUuidLike(thread.sessionId)) continue
    if (managedThreadIds.has(thread.sessionId)) continue
    if (knownSessionStarts.has(thread.sessionId)) continue

    const event: NormalizedEvent = {
      schemaVersion: 1,
      sessionId: thread.sessionId,
      timestamp: normalizeTimestamp(thread.createdAt),
      type: 'session_start',
      provider: 'codex',
      workspacePath: thread.workspacePath,
      managedByDaemon: false,
      canSendMessage: false,
      canTerminateSession: false,
      reason: EXTERNAL_SESSION_REASON,
    }

    if (emitEvent) emitEvent(event)
    else persistEvent(db, event)

    knownSessionStarts.add(thread.sessionId)
    imported++
  }

  return imported
}
