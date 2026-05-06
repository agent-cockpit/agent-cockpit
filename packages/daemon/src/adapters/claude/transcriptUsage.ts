import type { NormalizedEvent } from '@agentcockpit/shared'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const DEFAULT_CLAUDE_CONTEXT_WINDOW = 200_000

export interface ClaudeTranscriptUsageSnapshot {
  model?: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens: number
  contextUsedTokens: number
  contextWindowTokens: number
  contextPercent: number
}

export interface ClaudeTranscriptUsageOptions {
  claudeProjectsDir?: string
}

interface ClaudeUsageCounts {
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
}

function toNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return Math.round(value)
}

function readUsageCounts(value: unknown): ClaudeUsageCounts | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const usage = value as Record<string, unknown>
  const inputTokens = toNonNegativeInteger(usage['input_tokens'])
  const outputTokens = toNonNegativeInteger(usage['output_tokens'])
  if (inputTokens === null || outputTokens === null) return null

  return {
    inputTokens,
    outputTokens,
    cachedInputTokens:
      (toNonNegativeInteger(usage['cache_read_input_tokens']) ?? 0) +
      (toNonNegativeInteger(usage['cache_creation_input_tokens']) ?? 0),
  }
}

function readAssistantMessage(record: Record<string, unknown>): Record<string, unknown> | null {
  if (record['type'] !== 'assistant') return null
  const message = record['message']
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null
  return message as Record<string, unknown>
}

function readDedupeKey(record: Record<string, unknown>, message: Record<string, unknown>, lineIndex: number): string {
  const requestId = record['requestId']
  if (typeof requestId === 'string' && requestId.trim().length > 0) return `request:${requestId}`
  const messageId = message['id']
  if (typeof messageId === 'string' && messageId.trim().length > 0) return `message:${messageId}`
  const uuid = record['uuid']
  if (typeof uuid === 'string' && uuid.trim().length > 0) return `uuid:${uuid}`
  return `line:${lineIndex}`
}

function readClaudeModel(message: Record<string, unknown>): string | null {
  const model = message['model']
  if (typeof model !== 'string') return null
  const trimmed = model.trim()
  if (trimmed.length === 0 || trimmed === '<synthetic>') return null
  return trimmed
}

export function parseClaudeTranscriptUsageLines(lines: string[]): ClaudeTranscriptUsageSnapshot | null {
  const seen = new Set<string>()
  let inputTokens = 0
  let outputTokens = 0
  let cachedInputTokens = 0
  let contextUsedTokens = 0
  let model: string | undefined
  let sawUsage = false

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]?.trim()
    if (!line) continue

    let record: Record<string, unknown>
    try {
      record = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    const message = readAssistantMessage(record)
    if (!message) continue

    const counts = readUsageCounts(message['usage'])
    if (!counts) continue

    const key = readDedupeKey(record, message, index)
    if (seen.has(key)) continue
    seen.add(key)

    const messageModel = readClaudeModel(message)
    if (messageModel) model = messageModel

    sawUsage = true
    inputTokens += counts.inputTokens
    outputTokens += counts.outputTokens
    cachedInputTokens += counts.cachedInputTokens
    contextUsedTokens = counts.inputTokens + counts.cachedInputTokens
  }

  if (!sawUsage) return null

  const contextWindowTokens = DEFAULT_CLAUDE_CONTEXT_WINDOW
  const contextPercent = Math.max(
    0,
    Math.min(100, Math.round((contextUsedTokens / contextWindowTokens) * 100)),
  )

  return {
    ...(model ? { model } : {}),
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cachedInputTokens,
    contextUsedTokens,
    contextWindowTokens,
    contextPercent,
  }
}

function resolveClaudeProjectsDir(explicit?: string): string {
  if (explicit && explicit.trim().length > 0) return explicit
  return path.join(os.homedir(), '.claude', 'projects')
}

export function encodeClaudeProjectName(workspacePath: string): string {
  return path.resolve(workspacePath).replace(/[\\/]/g, '-')
}

function findTranscriptBySessionId(projectsDir: string, sessionId: string): string | null {
  const wanted = `${sessionId}.jsonl`
  const stack = [projectsDir]

  while (stack.length > 0) {
    const dir = stack.pop()
    if (!dir) continue

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isFile() && entry.name === wanted) return fullPath
      if (entry.isDirectory()) stack.push(fullPath)
    }
  }

  return null
}

export function resolveClaudeTranscriptPath(
  sessionId: string,
  workspacePath: string,
  options: ClaudeTranscriptUsageOptions = {},
): string | null {
  const projectsDir = resolveClaudeProjectsDir(options.claudeProjectsDir)
  const directPath = path.join(projectsDir, encodeClaudeProjectName(workspacePath), `${sessionId}.jsonl`)
  if (fs.existsSync(directPath)) return directPath
  return findTranscriptBySessionId(projectsDir, sessionId)
}

export function readClaudeTranscriptUsage(
  sessionId: string,
  workspacePath: string,
  options: ClaudeTranscriptUsageOptions = {},
): ClaudeTranscriptUsageSnapshot | null {
  const transcriptPath = resolveClaudeTranscriptPath(sessionId, workspacePath, options)
  if (!transcriptPath) return null

  let raw: string
  try {
    raw = fs.readFileSync(transcriptPath, 'utf8')
  } catch {
    return null
  }

  return parseClaudeTranscriptUsageLines(raw.split(/\r?\n/))
}

export function areClaudeUsageSnapshotsEqual(
  left: Partial<ClaudeTranscriptUsageSnapshot> | null | undefined,
  right: Partial<ClaudeTranscriptUsageSnapshot> | null | undefined,
): boolean {
  if (!left || !right) return false
  return (
    left.inputTokens === right.inputTokens &&
    left.outputTokens === right.outputTokens &&
    left.cachedInputTokens === right.cachedInputTokens &&
    left.contextUsedTokens === right.contextUsedTokens &&
    left.contextWindowTokens === right.contextWindowTokens &&
    left.contextPercent === right.contextPercent &&
    left.model === right.model
  )
}

export function toClaudeTranscriptUsageEvent(
  sessionId: string,
  usage: ClaudeTranscriptUsageSnapshot,
): NormalizedEvent {
  return {
    schemaVersion: 1,
    sessionId,
    type: 'session_usage',
    provider: 'claude',
    timestamp: new Date().toISOString(),
    ...(usage.model ? { model: usage.model } : {}),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    cachedInputTokens: usage.cachedInputTokens,
    contextUsedTokens: usage.contextUsedTokens,
    contextWindowTokens: usage.contextWindowTokens,
    contextPercent: usage.contextPercent,
  } as NormalizedEvent
}
