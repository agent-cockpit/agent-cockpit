import * as fs from 'node:fs'
import type Database from 'better-sqlite3'
import type { NormalizedEvent } from '@agentcockpit/shared'
import { persistEvent } from '../../db/queries.js'
import { resolveClaudeTranscriptPath } from './transcriptUsage.js'

type EmitFn = (event: NormalizedEvent) => void

interface ContentBlock {
  type: string
  text?: string
  name?: string
  input?: unknown
}

interface TranscriptRecord {
  type: string
  timestamp?: string
  message?: {
    role?: string
    content?: string | ContentBlock[]
  }
}

function parseRecords(raw: string): TranscriptRecord[] {
  const records: TranscriptRecord[] = []
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      records.push(JSON.parse(trimmed) as TranscriptRecord)
    } catch {
      // ignore malformed lines
    }
  }
  return records
}

function hasHistoryEvents(db: Database.Database, sessionId: string): boolean {
  return !!db
    .prepare(
      `SELECT 1 FROM events WHERE session_id = ? AND type IN ('session_chat_message', 'tool_call') LIMIT 1`,
    )
    .get(sessionId)
}

function chatMessageAlreadyPersisted(
  db: Database.Database,
  sessionId: string,
  role: string,
  content: string,
): boolean {
  return !!db
    .prepare(
      `SELECT 1 FROM events WHERE session_id = ? AND type = 'session_chat_message'
       AND JSON_EXTRACT(payload, '$.role') = ?
       AND JSON_EXTRACT(payload, '$.content') = ? LIMIT 1`,
    )
    .get(sessionId, role, content)
}

// Reads the Claude JSONL transcript for claudeSessionId and persists session_chat_message
// and tool_call events into the DB under cockpitSessionId.
// Returns the number of events imported; 0 if already imported or transcript not found.
export function importTranscriptHistory(
  db: Database.Database,
  cockpitSessionId: string,
  claudeSessionId: string,
  workspacePath: string,
): number {
  if (hasHistoryEvents(db, cockpitSessionId)) return 0

  const transcriptPath = resolveClaudeTranscriptPath(claudeSessionId, workspacePath)
  if (!transcriptPath) return 0

  let raw: string
  try {
    raw = fs.readFileSync(transcriptPath, 'utf8')
  } catch {
    return 0
  }

  const records = parseRecords(raw)
  let imported = 0

  for (const record of records) {
    const ts = record.timestamp ?? new Date().toISOString()

    if (record.type === 'user' && record.message?.role === 'user') {
      const content = record.message.content
      let text = ''
      if (typeof content === 'string') {
        text = content.trim()
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            text = block.text.trim()
            break
          }
        }
      }
      if (text) {
        persistEvent(db, {
          schemaVersion: 1,
          sessionId: cockpitSessionId,
          timestamp: ts,
          type: 'session_chat_message',
          provider: 'claude',
          role: 'user',
          content: text,
        } as NormalizedEvent)
        imported++
      }
    } else if (record.type === 'assistant' && record.message?.role === 'assistant') {
      const content = record.message.content
      if (!Array.isArray(content)) continue

      let textContent = ''
      for (const block of content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          textContent += block.text
        } else if (block.type === 'tool_use' && typeof block.name === 'string') {
          persistEvent(db, {
            schemaVersion: 1,
            sessionId: cockpitSessionId,
            timestamp: ts,
            type: 'tool_call',
            toolName: block.name,
            input: block.input ?? {},
          } as NormalizedEvent)
          imported++
        }
      }
      if (textContent.trim()) {
        persistEvent(db, {
          schemaVersion: 1,
          sessionId: cockpitSessionId,
          timestamp: ts,
          type: 'session_chat_message',
          provider: 'claude',
          role: 'assistant',
          content: textContent.trim(),
        } as NormalizedEvent)
        imported++
      }
    }
  }

  return imported
}

// Returns the number of parseable records in the JSONL (used for incremental tracking).
export function countTranscriptLines(claudeSessionId: string, workspacePath: string): number {
  const transcriptPath = resolveClaudeTranscriptPath(claudeSessionId, workspacePath)
  if (!transcriptPath) return 0
  let raw: string
  try {
    raw = fs.readFileSync(transcriptPath, 'utf8')
  } catch {
    return 0
  }
  return parseRecords(raw).length
}

// Import JSONL records starting from fromLine, emit each via emitEvent.
// Deduplicates chat messages already in DB (e.g. user message pre-emitted by the handler).
// Returns number of new events emitted.
export function importTranscriptFrom(
  db: Database.Database,
  cockpitSessionId: string,
  claudeSessionId: string,
  workspacePath: string,
  fromLine: number,
  emitEvent: EmitFn,
): number {
  const transcriptPath = resolveClaudeTranscriptPath(claudeSessionId, workspacePath)
  if (!transcriptPath) return 0
  let raw: string
  try {
    raw = fs.readFileSync(transcriptPath, 'utf8')
  } catch {
    return 0
  }
  const records = parseRecords(raw)
  if (records.length <= fromLine) return 0

  let emitted = 0
  for (const record of records.slice(fromLine)) {
    const ts = record.timestamp ?? new Date().toISOString()

    if (record.type === 'user' && record.message?.role === 'user') {
      const content = record.message.content
      let text = ''
      if (typeof content === 'string') {
        text = content.trim()
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            text = block.text.trim()
            break
          }
        }
      }
      if (text && !chatMessageAlreadyPersisted(db, cockpitSessionId, 'user', text)) {
        emitEvent({
          schemaVersion: 1,
          sessionId: cockpitSessionId,
          timestamp: ts,
          type: 'session_chat_message',
          provider: 'claude',
          role: 'user',
          content: text,
        } as NormalizedEvent)
        emitted++
      }
    } else if (record.type === 'assistant' && record.message?.role === 'assistant') {
      const content = record.message.content
      if (!Array.isArray(content)) continue

      let textContent = ''
      for (const block of content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          textContent += block.text
        } else if (block.type === 'tool_use' && typeof block.name === 'string') {
          emitEvent({
            schemaVersion: 1,
            sessionId: cockpitSessionId,
            timestamp: ts,
            type: 'tool_call',
            toolName: block.name,
            input: block.input ?? {},
          } as NormalizedEvent)
          emitted++
        }
      }
      if (textContent.trim() && !chatMessageAlreadyPersisted(db, cockpitSessionId, 'assistant', textContent.trim())) {
        emitEvent({
          schemaVersion: 1,
          sessionId: cockpitSessionId,
          timestamp: ts,
          type: 'session_chat_message',
          provider: 'claude',
          role: 'assistant',
          content: textContent.trim(),
        } as NormalizedEvent)
        emitted++
      }
    }
  }

  return emitted
}
