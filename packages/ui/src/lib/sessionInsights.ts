export interface SessionInsightEvent {
  type: string
  filePath?: string
  changeType?: string
  toolName?: string
  input?: unknown
  output?: unknown
  content?: unknown
  message?: unknown
  errorMessage?: unknown
  reason?: unknown
  exitCode?: number
  success?: boolean
  [key: string]: unknown
}

export interface TestSignal {
  label: string
  color: string
}

export function valueText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null || value === undefined) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

export function eventText(event: SessionInsightEvent): string {
  return [
    event.type,
    event.toolName,
    valueText(event.input),
    valueText(event.output),
    valueText(event.content),
    valueText(event.message),
    valueText(event.errorMessage),
    valueText(event.reason),
  ].filter(Boolean).join(' ')
}

export function extractChangedFiles(events: SessionInsightEvent[]): string[] {
  const files = new Set<string>()
  let sawFileChange = false

  for (const event of events) {
    if (event.type === 'file_change' && typeof event.filePath === 'string' && event.filePath.trim()) {
      sawFileChange = true
      files.add(event.filePath.trim())
    }
  }

  // Fall back to tool-call inference only when no file_change events are present.
  if (!sawFileChange) {
    for (const event of events) {
      if ((event.type === 'tool_call' || event.type === 'tool_called') && event.input && typeof event.input === 'object') {
        const input = event.input as Record<string, unknown>
        const candidate = input['filePath'] ?? input['file_path'] ?? input['path']
        if (typeof candidate === 'string' && candidate.trim()) {
          files.add(candidate.trim())
        }
      }
    }
  }

  return Array.from(files).sort((a, b) => a.localeCompare(b))
}

export interface ChangedFileSummary {
  total: number
  created: number
  modified: number
  deleted: number
  fromEvents: boolean
  files: Array<{ path: string; changeType: 'created' | 'modified' | 'deleted' | 'unknown' }>
}

export function deriveChangedFileSummary(events: SessionInsightEvent[]): ChangedFileSummary {
  const fromEventMap = new Map<string, 'created' | 'modified' | 'deleted'>()
  for (const event of events) {
    if (event.type !== 'file_change') continue
    const path = typeof event.filePath === 'string' ? event.filePath.trim() : ''
    if (!path) continue
    const change = event.changeType
    if (change === 'created' || change === 'modified' || change === 'deleted') {
      fromEventMap.set(path, change)
    } else if (!fromEventMap.has(path)) {
      fromEventMap.set(path, 'modified')
    }
  }

  if (fromEventMap.size > 0) {
    const files = [...fromEventMap.entries()]
      .map(([path, changeType]) => ({ path, changeType }))
      .sort((a, b) => a.path.localeCompare(b.path))
    let created = 0, modified = 0, deleted = 0
    for (const file of files) {
      if (file.changeType === 'created') created++
      else if (file.changeType === 'modified') modified++
      else if (file.changeType === 'deleted') deleted++
    }
    return { total: files.length, created, modified, deleted, fromEvents: true, files }
  }

  const fallback = new Set<string>()
  for (const event of events) {
    if ((event.type === 'tool_call' || event.type === 'tool_called') && event.input && typeof event.input === 'object') {
      const input = event.input as Record<string, unknown>
      const candidate = input['filePath'] ?? input['file_path'] ?? input['path']
      if (typeof candidate === 'string' && candidate.trim()) {
        fallback.add(candidate.trim())
      }
    }
  }
  const files = Array.from(fallback)
    .sort((a, b) => a.localeCompare(b))
    .map((path) => ({ path, changeType: 'unknown' as const }))
  return { total: files.length, created: 0, modified: 0, deleted: 0, fromEvents: false, files }
}

export function deriveTestSignal(events: SessionInsightEvent[]): TestSignal {
  const testEvents = events.filter((event) => {
    const text = eventText(event).toLowerCase()
    return /\b(test|vitest|jest|pytest|go test|cargo test|pnpm test|npm test|yarn test)\b/.test(text)
  })

  if (testEvents.length === 0) {
    return { label: 'No test result detected', color: 'var(--color-cockpit-dim)' }
  }

  const combined = testEvents.map(eventText).join(' ').toLowerCase()
  if (
    testEvents.some((event) => typeof event.exitCode === 'number' && event.exitCode > 0) ||
    /\b(failed|failure|error)\b|exit code[:= ]+[1-9]/.test(combined)
  ) {
    return { label: 'Tests failed', color: 'var(--color-cockpit-red)' }
  }
  if (
    testEvents.some((event) => event.success === true || event.exitCode === 0) ||
    /\b(passed|passing|success|succeeded)\b|exit code[:= ]+0/.test(combined)
  ) {
    return { label: 'Tests passed', color: 'var(--color-cockpit-green)' }
  }
  return { label: 'Test command detected', color: 'var(--color-cockpit-amber)' }
}
