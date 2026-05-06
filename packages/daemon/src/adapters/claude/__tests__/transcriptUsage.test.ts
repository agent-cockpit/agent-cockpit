import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  encodeClaudeProjectName,
  parseClaudeTranscriptUsageLines,
  readClaudeTranscriptUsage,
  resolveClaudeTranscriptPath,
} from '../transcriptUsage.js'

const tempRoots: string[] = []

function mktempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-transcript-usage-'))
  tempRoots.push(dir)
  return dir
}

function assistantLine(options: {
  requestId?: string
  messageId?: string
  model?: string
  input: number
  output: number
  cacheRead?: number
  cacheCreation?: number
}): string {
  return JSON.stringify({
    type: 'assistant',
    requestId: options.requestId,
    message: {
      id: options.messageId,
      role: 'assistant',
      model: options.model ?? 'claude-sonnet-4-6-20260401',
      usage: {
        input_tokens: options.input,
        output_tokens: options.output,
        cache_read_input_tokens: options.cacheRead ?? 0,
        cache_creation_input_tokens: options.cacheCreation ?? 0,
      },
      content: [{ type: 'text', text: 'ok' }],
    },
  })
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop()
    if (!dir) continue
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('Claude transcript usage', () => {
  it('sums unique assistant usage snapshots and computes latest context percent', () => {
    const snapshot = parseClaudeTranscriptUsageLines([
      assistantLine({
        requestId: 'req-1',
        messageId: 'msg-1',
        input: 1200,
        output: 80,
        cacheRead: 300,
        cacheCreation: 50,
      }),
      assistantLine({
        requestId: 'req-1',
        messageId: 'msg-1',
        input: 1200,
        output: 80,
        cacheRead: 300,
        cacheCreation: 50,
      }),
      assistantLine({
        requestId: 'req-2',
        messageId: 'msg-2',
        model: 'claude-opus-4-6-20260401',
        input: 2400,
        output: 160,
        cacheRead: 100,
      }),
    ])

    expect(snapshot).toMatchObject({
      model: 'claude-opus-4-6-20260401',
      inputTokens: 3600,
      outputTokens: 240,
      totalTokens: 3840,
      cachedInputTokens: 450,
      contextUsedTokens: 2500,
      contextWindowTokens: 200000,
      contextPercent: 1,
    })
  })

  it('returns null when no assistant usage exists', () => {
    expect(parseClaudeTranscriptUsageLines([
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }),
      'not-json',
    ])).toBeNull()
  })

  it('resolves and reads the direct Claude project transcript path', () => {
    const projectsDir = mktempDir()
    const workspacePath = path.join(projectsDir, 'workspace')
    const sessionId = 'session-123'
    const projectDir = path.join(projectsDir, encodeClaudeProjectName(workspacePath))
    fs.mkdirSync(projectDir, { recursive: true })
    fs.writeFileSync(path.join(projectDir, `${sessionId}.jsonl`), assistantLine({
      requestId: 'req-direct',
      messageId: 'msg-direct',
      input: 42,
      output: 8,
    }), 'utf8')

    expect(resolveClaudeTranscriptPath(sessionId, workspacePath, { claudeProjectsDir: projectsDir }))
      .toBe(path.join(projectDir, `${sessionId}.jsonl`))
    expect(readClaudeTranscriptUsage(sessionId, workspacePath, { claudeProjectsDir: projectsDir }))
      .toMatchObject({
        inputTokens: 42,
        outputTokens: 8,
        contextUsedTokens: 42,
      })
  })
})
