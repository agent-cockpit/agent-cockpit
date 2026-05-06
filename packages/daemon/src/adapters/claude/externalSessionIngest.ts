import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type Database from 'better-sqlite3'
import type { NormalizedEvent } from '@agentcockpit/shared'
import { EXTERNAL_SESSION_REASON, isExternalSessionDeleted, persistEvent } from '../../db/queries.js'
import { getOrCreateSessionId } from './hookParser.js'
import { importTranscriptHistory } from './transcriptHistory.js'

interface ClaudeSessionFile {
  pid: number
  sessionId: string
  cwd: string
  startedAt: number
}

type PidProbeStatus = 'alive' | 'dead' | 'unknown'

export interface ExternalClaudeIngestOptions {
  sessionsPath?: string
  probePid?: (pid: number) => PidProbeStatus
}

function resolveClaudeSessionsPath(explicitPath?: string): string {
  if (explicitPath && explicitPath.length > 0) return explicitPath
  const fromEnv = process.env['COCKPIT_CLAUDE_SESSIONS_PATH']?.trim()
  if (fromEnv) return fromEnv
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

function probePid(pid: number): PidProbeStatus {
  try {
    process.kill(pid, 0)
    return 'alive'
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ESRCH') return 'dead'
    if (code === 'EPERM') return 'unknown'
    // Unknown error codes (platform-specific) — treat as unknown to avoid false session_end.
    // Log so we can diagnose platform-specific probe failures.
    console.warn(`[externalSessionIngest] probePid(${pid}) unexpected error code=${code ?? 'undefined'}: ${String(err)}`)
    return 'unknown'
  }
}

function getSessionStatus(
  db: Database.Database,
  sessionId: string,
): { hasStart: boolean; hasEnd: boolean; startedAsManaged: boolean | null } {
  const startRow = db
    .prepare(`
      SELECT
        1 AS found,
        JSON_EXTRACT(payload, '$.managedByDaemon') AS managed_by_daemon
      FROM events
      WHERE session_id = ? AND type = 'session_start'
      ORDER BY sequence_number DESC
      LIMIT 1
    `)
    .get(sessionId) as { found: number; managed_by_daemon: unknown } | undefined
  const endRow = db
    .prepare(`SELECT 1 AS found FROM events WHERE session_id = ? AND type = 'session_end' LIMIT 1`)
    .get(sessionId) as { found: number } | undefined
  const managed = startRow?.managed_by_daemon
  const startedAsManaged = managed === 1 || managed === true ? true : managed === 0 || managed === false ? false : null
  return { hasStart: !!startRow?.found, hasEnd: !!endRow?.found, startedAsManaged }
}

export interface AliveExternalClaudeSession {
  cockpitId: string
  claudeSessionId: string
  workspacePath: string
}

export function getAliveExternalClaudeSessions(
  db: Database.Database,
  options: ExternalClaudeIngestOptions = {},
): AliveExternalClaudeSession[] {
  const sessionsPath = resolveClaudeSessionsPath(options.sessionsPath)
  const files = readSessionFiles(sessionsPath)
  const result: AliveExternalClaudeSession[] = []
  for (const file of files) {
    if (isExternalSessionDeleted(db, file.sessionId)) continue
    const pidStatus = (options.probePid ?? probePid)(file.pid)
    if (pidStatus !== 'alive') continue
    const cockpitId = getOrCreateSessionId(file.sessionId, file.cwd)
    result.push({ cockpitId, claudeSessionId: file.sessionId, workspacePath: file.cwd })
  }
  return result
}

export function ingestExternalClaudeSessions(
  db: Database.Database,
  emitEvent?: (event: NormalizedEvent) => void,
  options: ExternalClaudeIngestOptions = {},
): number {
  const sessionsPath = resolveClaudeSessionsPath(options.sessionsPath)
  const files = readSessionFiles(sessionsPath)
  if (files.length === 0) return 0

  const emit = (event: NormalizedEvent): void => {
    if (emitEvent) emitEvent(event)
    else persistEvent(db, event)
  }

  let imported = 0

  for (const file of files) {
    if (isExternalSessionDeleted(db, file.sessionId)) continue

    const cockpitId = getOrCreateSessionId(file.sessionId, file.cwd)
    const { hasStart, hasEnd, startedAsManaged } = getSessionStatus(db, cockpitId)
    const pidStatus = (options.probePid ?? probePid)(file.pid)

    // Never import a session whose process is already dead — avoids ghost sessions
    // appearing briefly on daemon restart or after DB cleanup, only to be closed next poll.
    if (!hasStart && pidStatus !== 'dead') {
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

    // Only close external sessions when PID is definitively dead.
    // EPERM/unknown states can happen without process death on Linux.
    const shouldCloseByPid = hasStart && !hasEnd && startedAsManaged !== true && pidStatus === 'dead'
    if (shouldCloseByPid) {
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

// Imports transcript history (messages + tool calls) for all non-deleted external Claude sessions.
// Safe to call multiple times: skips sessions that already have history events in the DB.
export function importAllExternalClaudeTranscripts(
  db: Database.Database,
  options: ExternalClaudeIngestOptions = {},
): number {
  const sessionsPath = resolveClaudeSessionsPath(options.sessionsPath)
  const files = readSessionFiles(sessionsPath)
  let total = 0
  for (const file of files) {
    if (isExternalSessionDeleted(db, file.sessionId)) continue
    const cockpitId = getOrCreateSessionId(file.sessionId, file.cwd)
    total += importTranscriptHistory(db, cockpitId, file.sessionId, file.cwd)
  }
  return total
}
