import { useEffect, useMemo, useState } from 'react'
import type { NormalizedEvent } from '@agentcockpit/shared'
import { useStore } from '../../store/index.js'
import { EMPTY_EVENTS } from '../../store/eventsSlice.js'
import { DAEMON_URL } from '../../lib/daemonUrl.js'
import { formatReplayCursor, sliceEventsForReplay } from '../../lib/replay.js'
import {
  deriveChangedFileSummary,
  deriveTestSignal,
  type SessionInsightEvent,
} from '../../lib/sessionInsights.js'
import { usePanelSessionId } from './sessionScope.js'

interface FileEntry {
  filePath: string
  changeType: 'created' | 'modified' | 'deleted'
  diff?: string
  lastSeenIndex: number
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function splitDiffLines(text: string): string[] {
  return text.split('\n')
}

function buildSyntheticDiff(
  filePath: string,
  changeType: FileEntry['changeType'],
  oldText: string | null,
  newText: string | null,
): string | undefined {
  if (changeType === 'created' && newText) {
    const addedLines = splitDiffLines(newText).map((line) => `+${line}`)
    return [`--- /dev/null`, `+++ b/${filePath}`, '@@', ...addedLines].join('\n')
  }

  if (changeType === 'deleted' && oldText) {
    const removedLines = splitDiffLines(oldText).map((line) => `-${line}`)
    return [`--- a/${filePath}`, `+++ /dev/null`, '@@', ...removedLines].join('\n')
  }

  if (oldText !== null && newText !== null) {
    const removedLines = splitDiffLines(oldText).map((line) => `-${line}`)
    const addedLines = splitDiffLines(newText).map((line) => `+${line}`)
    return [`--- a/${filePath}`, `+++ b/${filePath}`, '@@', ...removedLines, ...addedLines].join('\n')
  }

  return undefined
}

function deriveEntryFromToolCall(event: NormalizedEvent): Omit<FileEntry, 'lastSeenIndex'> | null {
  if (event.type !== 'tool_call' && event.type !== 'tool_called') return null

  const input = event.input
  if (!input || typeof input !== 'object') return null
  const toolInput = input as Record<string, unknown>
  const toolName = event.toolName

  if (!['Write', 'Edit', 'Update', 'MultiEdit'].includes(toolName)) {
    return null
  }

  const filePath =
    typeof toolInput['path'] === 'string'
      ? toolInput['path']
      : typeof toolInput['file_path'] === 'string'
        ? toolInput['file_path']
        : null
  if (!filePath) return null

  const oldString = typeof toolInput['old_string'] === 'string' ? toolInput['old_string'] : null
  const newString = typeof toolInput['new_string'] === 'string' ? toolInput['new_string'] : null
  const content = typeof toolInput['content'] === 'string' ? toolInput['content'] : null

  const changeType: FileEntry['changeType'] = toolName === 'Write' ? 'created' : 'modified'
  const diff =
    toolName === 'Write'
      ? buildSyntheticDiff(filePath, changeType, null, content)
      : buildSyntheticDiff(filePath, changeType, oldString, newString)

  return {
    filePath,
    changeType,
    diff,
  }
}

function deriveFileTree(events: NormalizedEvent[]): FileEntry[] {
  const map = new Map<string, FileEntry>()

  function upsertEntry(entry: Omit<FileEntry, 'lastSeenIndex'>, lastSeenIndex: number): void {
    const existing = map.get(entry.filePath)
    map.set(entry.filePath, {
      filePath: entry.filePath,
      changeType: entry.changeType,
      diff: entry.diff ?? existing?.diff,
      lastSeenIndex,
    })
  }

  events.forEach((event, index) => {
    if (event.type === 'file_change') {
      upsertEntry({
        filePath: event.filePath,
        changeType: event.changeType,
        diff: event.diff,
      }, index)
      return
    }

    const toolEntry = deriveEntryFromToolCall(event)
    if (toolEntry) {
      upsertEntry(toolEntry, index)
    }
  })
  return [...map.values()].sort((a, b) => b.lastSeenIndex - a.lastSeenIndex)
}

function formatElapsed(ms: number): string {
  if (ms < 60000) {
    return `${Math.floor(ms / 1000)}s`
  }
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

function groupFileEntries(fileTree: FileEntry[]): Record<FileEntry['changeType'], FileEntry[]> {
  return {
    created: fileTree.filter((entry) => entry.changeType === 'created'),
    modified: fileTree.filter((entry) => entry.changeType === 'modified'),
    deleted: fileTree.filter((entry) => entry.changeType === 'deleted'),
  }
}

function buildCopySummary({
  sessionId,
  finalStatus,
  elapsedMs,
  fileTree,
}: {
  sessionId: string
  finalStatus: string
  elapsedMs: number | null
  fileTree: FileEntry[]
}): string {
  const groups = groupFileEntries(fileTree)
  const lines = [
    'Agent Cockpit diff summary',
    `Session: ${sessionId}`,
    `Status: ${finalStatus}`,
    `Elapsed: ${elapsedMs === null ? 'n/a' : formatElapsed(elapsedMs)}`,
    `Files touched: ${fileTree.length}`,
    '',
  ]

  for (const [label, entries] of [
    ['Created', groups.created],
    ['Modified', groups.modified],
    ['Deleted', groups.deleted],
  ] as const) {
    lines.push(`${label} (${entries.length}):`)
    if (entries.length === 0) {
      lines.push('- none')
    } else {
      entries.forEach((entry) => lines.push(`- ${entry.filePath}`))
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}

function DiffView({ diff }: { diff: string }) {
  const lines = diff.split('\n')
  return (
    <pre className="text-xs [font-family:var(--font-mono-data)] overflow-x-auto p-3">
      {lines.map((line, i) => {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          return (
            <div
              key={i}
              data-testid="diff-line-add"
              className="text-emerald-400 bg-emerald-900/20"
            >
              {line}
            </div>
          )
        }
        if (line.startsWith('-') && !line.startsWith('---')) {
          return (
            <div
              key={i}
              data-testid="diff-line-del"
              className="text-rose-400 bg-rose-900/20"
            >
              {line}
            </div>
          )
        }
        if (line.startsWith('@')) {
          return (
            <div key={i} style={{ color: 'var(--color-cockpit-accent)', opacity: 0.7 }}>
              {line}
            </div>
          )
        }
        return <div key={i} className="text-muted-foreground">{line}</div>
      })}
    </pre>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DiffPanel() {
  const sessionId = usePanelSessionId()
  const events = useStore((s) => s.events[sessionId!] ?? EMPTY_EVENTS)
  const bulkApplyEvents = useStore((s) => s.bulkApplyEvents)
  const session = useStore((s) => (sessionId ? s.sessions[sessionId] : undefined))
  const replayCursor = useStore((s) => (sessionId ? s.replayCursorBySession[sessionId] ?? null : null))
  const focusedFile = useStore((s) => (sessionId ? s.focusedFileBySession[sessionId] ?? null : null))
  const setFocusedFile = useStore((s) => s.setFocusedFile)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [highlightedFilePath, setHighlightedFilePath] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')

  // Derived values
  const replayEvents = useMemo(() => sliceEventsForReplay(events, replayCursor), [events, replayCursor])
  const fileTree = deriveFileTree(replayEvents)
  const filesTouched = fileTree.length
  const finalStatus = session?.status ?? 'unknown'
  const startEvent = replayEvents.find((e) => e.type === 'session_start')
  const endEvent = [...replayEvents].reverse().find((e) => e.type === 'session_end')
  const startTime = startEvent ? new Date(startEvent.timestamp).getTime() : null
  const endTime =
      endEvent
      ? new Date(endEvent.timestamp).getTime()
        : replayEvents.at(-1)?.timestamp
          ? new Date(replayEvents.at(-1)!.timestamp).getTime()
          : null
  const elapsedMs = startTime !== null && endTime !== null ? endTime - startTime : null
  const selectedEntry = fileTree.find((f) => f.filePath === selectedFilePath) ?? null
  const changeGroups = groupFileEntries(fileTree)
  const testSignal = useMemo(
    () => deriveTestSignal(replayEvents as unknown as SessionInsightEvent[]),
    [replayEvents],
  )
  const changeSummary = useMemo(
    () => deriveChangedFileSummary(replayEvents as unknown as SessionInsightEvent[]),
    [replayEvents],
  )
  const canCopySummary =
    filesTouched > 0 &&
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.writeText === 'function'

  useEffect(() => {
    if (!sessionId) return
    if (events.length > 0) return
    fetch(`${DAEMON_URL}/api/sessions/${sessionId}/events`)
      .then((r) => r.json())
      .then((evs: NormalizedEvent[]) => bulkApplyEvents(sessionId, evs))
      .catch(() => {
        /* silently ignore */
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    if (fileTree.length === 0) {
      if (selectedFilePath !== null) setSelectedFilePath(null)
      return
    }

    const selectionStillExists = selectedFilePath
      ? fileTree.some((entry) => entry.filePath === selectedFilePath)
      : false

    if (!selectionStillExists) {
      setSelectedFilePath(fileTree[0]!.filePath)
    }
  }, [fileTree, selectedFilePath])

  useEffect(() => {
    setCopyStatus('idle')
  }, [filesTouched, finalStatus, elapsedMs])

  // Jump to focused file from Timeline cross-panel link
  useEffect(() => {
    if (!focusedFile || !sessionId) return
    if (fileTree.some((e) => e.filePath === focusedFile)) {
      setSelectedFilePath(focusedFile)
      setHighlightedFilePath(focusedFile)
      window.setTimeout(() => setHighlightedFilePath(null), 1500)
    }
    setFocusedFile(sessionId, null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedFile])

  async function copySummary(): Promise<void> {
    if (!sessionId || !canCopySummary) return
    try {
      await navigator.clipboard.writeText(
        buildCopySummary({
          sessionId,
          finalStatus,
          elapsedMs,
          fileTree,
        }),
      )
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Summary banner */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-[var(--color-panel-surface)]">
        <span className="data-readout text-[10px]">
          <span className="data-readout-dim">FILES:&nbsp;</span>
          <span className="tabular-nums">{String(filesTouched).padStart(2, '0')}</span>
        </span>
        <span className="data-readout-dim text-[10px]">
          +{changeGroups.created.length} ~{changeGroups.modified.length} -{changeGroups.deleted.length}
        </span>
        <span className="[font-family:var(--font-mono-data)] text-[10px] uppercase tracking-wide"
              style={{ color: finalStatus === 'active' ? 'var(--color-cockpit-green)' : finalStatus === 'error' ? 'var(--color-cockpit-red)' : 'var(--color-cockpit-dim)' }}>
          {finalStatus}
        </span>
        {elapsedMs !== null && (
          <span className="data-readout-dim text-[10px] tabular-nums">{formatElapsed(elapsedMs)}</span>
        )}
        <span
          data-testid="diff-test-signal"
          className="border px-1.5 py-0.5 [font-family:var(--font-mono-data)] text-[9px] uppercase tracking-wide"
          style={{ color: testSignal.color, borderColor: testSignal.color }}
          title={testSignal.label}
        >
          {testSignal.label}
        </span>
        <button
          type="button"
          onClick={() => void copySummary()}
          disabled={!canCopySummary}
          className="ml-auto cockpit-btn py-0.5 text-[9px] disabled:cursor-not-allowed disabled:opacity-40"
          data-testid="copy-diff-summary"
        >
          {copyStatus === 'copied' ? 'Copied' : copyStatus === 'error' ? 'Copy Failed' : 'Copy Summary'}
        </button>
      </div>
      {replayCursor !== null && (
        <div data-testid="diff-replay-banner" className="border-b border-border bg-[var(--color-panel-surface)]/70 px-4 py-1.5 text-[10px] [font-family:var(--font-mono-data)] uppercase tracking-wide text-[var(--color-cockpit-amber)]">
          Replay view · {formatReplayCursor(replayCursor, events.length)}
        </div>
      )}

      {/* Per-session change summary */}
      {changeSummary.total > 0 && (
        <div
          data-testid="diff-change-summary"
          className="border-b border-border bg-[var(--color-panel-surface)]/60 px-4 py-2 [font-family:var(--font-mono-data)] text-[10px]"
        >
          <span className="cockpit-label mr-2">Change summary:</span>
          <span className="text-foreground">{changeSummary.total} file{changeSummary.total === 1 ? '' : 's'}</span>
          <span className="text-muted-foreground"> · +{changeSummary.created} ~{changeSummary.modified} -{changeSummary.deleted}</span>
          {!changeSummary.fromEvents && (
            <span
              data-testid="diff-fallback-note"
              className="ml-2 italic text-[var(--color-cockpit-amber)]"
              title="No file_change events present — paths inferred from Write/Edit tool calls."
            >
              (inferred from tool calls)
            </span>
          )}
          {changeSummary.files.length > 0 && (
            <ul className="mt-1 space-y-0 text-muted-foreground">
              {changeSummary.files.slice(0, 5).map((f) => (
                <li key={f.path} className="truncate" title={f.path}>
                  <span className="text-foreground">{f.changeType === 'unknown' ? '?' : f.changeType === 'created' ? '+' : f.changeType === 'deleted' ? '-' : '~'}</span>{' '}
                  {f.path}
                </li>
              ))}
              {changeSummary.files.length > 5 && (
                <li className="data-readout-dim">…and {changeSummary.files.length - 5} more</li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Body: file tree + diff view */}
      <div className="flex flex-1 overflow-hidden">
        {/* File tree */}
        <div className="w-64 border-r border-border overflow-y-auto bg-[var(--color-panel-surface)]">
          {fileTree.length === 0 ? (
            <div className="p-4 cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }}>No files changed</div>
          ) : (
            fileTree.map((entry) => {
              const changeColor =
                entry.changeType === 'created' ? 'var(--color-cockpit-green)' :
                entry.changeType === 'deleted' ? 'var(--color-cockpit-red)' :
                'var(--color-cockpit-amber)'
              return (
                <div
                  key={entry.filePath}
                  data-testid="file-tree-row"
                  onClick={() => setSelectedFilePath(entry.filePath)}
                  className={`px-3 py-2 cursor-pointer transition-colors ${
                    entry.filePath === selectedFilePath
                      ? 'bg-[color-mix(in_srgb,var(--color-cockpit-accent)_10%,transparent)] border-l-2 border-l-[var(--color-cockpit-accent)]'
                      : entry.filePath === highlightedFilePath
                        ? 'bg-[color-mix(in_srgb,var(--color-cockpit-green)_15%,transparent)] border-l-2 border-l-[var(--color-cockpit-green)] animate-pulse'
                        : 'hover:bg-muted/30 border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="[font-family:var(--font-mono-data)] text-[10px] text-foreground">{entry.filePath.split('/').pop()}</div>
                  <div className="data-readout-dim text-[10px] truncate">{entry.filePath}</div>
                  <span className="[font-family:var(--font-mono-data)] text-[9px] uppercase" style={{ color: changeColor }}>
                    {entry.changeType}
                  </span>
                </div>
              )
            })
          )}
        </div>

        {/* Diff view */}
        <div className="flex-1 overflow-auto">
          {selectedEntry === null ? (
            <div className="flex items-center justify-center h-full cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }}>
              -- SELECT FILE --
            </div>
          ) : selectedEntry.diff ? (
            <DiffView diff={selectedEntry.diff} />
          ) : (
            <div className="p-4 cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }}>No diff available</div>
          )}
        </div>
      </div>
    </div>
  )
}
