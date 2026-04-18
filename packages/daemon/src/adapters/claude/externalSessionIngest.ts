import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type Database from 'better-sqlite3'
import type { NormalizedEvent } from '@cockpit/shared'
import { EXTERNAL_SESSION_REASON, persistEvent } from '../../db/queries.js'
import { getOrCreateSessionId } from './hookParser.js'

interface ClaudeSessionFile {
  pid: number
  sessionId: string
  cwd: string
  startedAt: number
}

function resolveClaudeSessionsPath(): string {
  return path.join(os.homedir(), '.claude', 'sessions')
}

function readSessionFiles(sessionsPath: string): ClaudeSessionFile[] {
  let entries: string[]
  try {
    entries = fs.readdirSync(sessionsPath)
  } catch {
    return []
  }

  const sessions: ClaudeSessionFile[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    try {
      const raw = fs.readFileSync(path.join(sessionsPath, entry), 'utf8')
      const data = JSON.parse(raw) as Partial<ClaudeSessionFile>
      if (
        typeof data.pid === 'number' &&
        typeof data.sessionId === 'string' &&
        typeof data.cwd === 'string'
      ) {
        sessions.push(data as ClaudeSessionFile)
      }
    } catch {
      // ignore malformed files
    }
  }
  return sessions
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function getSessionStatus(db: Database.Database, sessionId: string): { hasStart: boolean; hasEnd: boolean } {
  const startRow = db
    .prepare(`SELECT 1 AS found FROM events WHERE session_id = ? AND type = 'session_start' LIMIT 1`)
    .get(sessionId) as { found: number } | undefined
  const endRow = db
    .prepare(`SELECT 1 AS found FROM events WHERE session_id = ? AND type = 'session_end' LIMIT 1`)
    .get(sessionId) as { found: number } | undefined
  return { hasStart: !!startRow?.found, hasEnd: !!endRow?.found }
}

export function ingestExternalClaudeSessions(
  db: Database.Database,
  emitEvent?: (event: NormalizedEvent) => void,
): number {
  const sessionsPath = resolveClaudeSessionsPath()
  const files = readSessionFiles(sessionsPath)
  if (files.length === 0) return 0

  const emit = (event: NormalizedEvent): void => {
    if (emitEvent) emitEvent(event)
    else persistEvent(db, event)
  }

  let imported = 0

  for (const file of files) {
    const cockpitId = getOrCreateSessionId(file.sessionId, file.cwd)
    const { hasStart, hasEnd } = getSessionStatus(db, cockpitId)

    if (!hasStart) {
      const ts = file.startedAt ? new Date(file.startedAt).toISOString() : new Date().toISOString()
      emit({
        schemaVersion: 1,
        sessionId: cockpitId,
        timestamp: ts,
        type: 'session_start',
        provider: 'claude',
        workspacePath: file.cwd,
        managedByDaemon: false,
        canSendMessage: false,
        canTerminateSession: false,
        reason: EXTERNAL_SESSION_REASON,
      } as NormalizedEvent)
      imported++
    }

    // PID dead but session still open in DB → close it
    if (hasStart && !hasEnd && !isPidAlive(file.pid)) {
      emit({
        schemaVersion: 1,
        sessionId: cockpitId,
        timestamp: new Date().toISOString(),
        type: 'session_end',
        provider: 'claude',
      } as NormalizedEvent)
    }
  }

  return imported
}
