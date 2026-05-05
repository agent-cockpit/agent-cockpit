import { useEffect, useState } from 'react'
import type { NormalizedEvent } from '@agentcockpit/shared'
import { useStore } from '../../store/index.js'
import { EMPTY_EVENTS } from '../../store/eventsSlice.js'
import { DAEMON_URL } from '../../lib/daemonUrl.js'
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
  if (event.type !== 'tool_call') return null

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

  return { filePath, changeType, diff }
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
      upsertEntry({ filePath: event.filePath, changeType: event.changeType, diff: event.diff }, index)
      return
    }
    const toolEntry = deriveEntryFromToolCall(event)
    if (toolEntry) upsertEntry(toolEntry, index)
  })

  return [...map.values()].sort((a, b) => b.lastSeenIndex - a.lastSeenIndex)
}

function formatElapsed(ms: number): string {
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

// ─── Diff renderer ─────────────────────────────────────────────────────────────

function DiffView({ diff }: { diff: string }) {
  const lines = diff.split('\n')
  return (
    <pre className="text-xs [font-family:var(--font-mono-data)] overflow-x-auto p-3">
      {lines.map((line, i) => {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          return (
            <div key={i} data-testid="diff-line-add" className="text-emerald-400 bg-emerald-900/20">
              {line}
            </div>
          )
        }
        if (line.startsWith('-') && !line.startsWith('---')) {
          return (
            <div key={i} data-testid="diff-line-del" className="text-rose-400 bg-rose-900/20">
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
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)

  const fileTree = deriveFileTree(events)
  const filesTouched = fileTree.length
  const finalStatus = session?.status ?? 'unknown'
  const startEvent = events.find((e) => e.type === 'session_start')
  const endEvent = [...events].reverse().find((e) => e.type === 'session_end')
  const startTime = startEvent ? new Date(startEvent.timestamp).getTime() : null
  const endTime =
    endEvent
      ? new Date(endEvent.timestamp).getTime()
      : session?.lastEventAt
        ? new Date(session.lastEventAt).getTime()
        : null
  const elapsedMs = startTime !== null && endTime !== null ? endTime - startTime : null
  const selectedEntry = fileTree.find((f) => f.filePath === selectedFilePath) ?? null

  useEffect(() => {
    if (!sessionId) return
    if (events.length > 0) return
    fetch(`${DAEMON_URL}/api/sessions/${sessionId}/events`)
      .then((r) => r.json())
      .then((evs: NormalizedEvent[]) => bulkApplyEvents(sessionId, evs))
      .catch(() => {})
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

  return (
    <div className="flex flex-col h-full">
      {/* Summary banner */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-[var(--color-panel-surface)] shrink-0">
        <span className="data-readout text-[10px]">
          <span className="data-readout-dim">FILES:&nbsp;</span>
          <span className="tabular-nums">{String(filesTouched).padStart(2, '0')}</span>
        </span>
        <span
          className="[font-family:var(--font-mono-data)] text-[10px] uppercase tracking-wide"
          style={{
            color:
              finalStatus === 'active'
                ? 'var(--color-cockpit-green)'
                : finalStatus === 'error'
                  ? 'var(--color-cockpit-red)'
                  : 'var(--color-cockpit-dim)',
          }}
        >
          {finalStatus}
        </span>
        {elapsedMs !== null && (
          <span className="data-readout-dim text-[10px] tabular-nums">{formatElapsed(elapsedMs)}</span>
        )}
      </div>

      {/* File chips strip */}
      {fileTree.length > 0 && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-[var(--color-panel-surface)] overflow-x-auto shrink-0">
          {fileTree.map((entry) => {
            const changeColor =
              entry.changeType === 'created'
                ? 'var(--color-cockpit-green)'
                : entry.changeType === 'deleted'
                  ? 'var(--color-cockpit-red)'
                  : 'var(--color-cockpit-amber)'
            const isSelected = entry.filePath === selectedFilePath
            const fileName = entry.filePath.split('/').pop() ?? entry.filePath

            return (
              <button
                key={entry.filePath}
                data-testid="file-tree-row"
                onClick={() => setSelectedFilePath(entry.filePath)}
                title={entry.filePath}
                className={`flex items-center gap-1.5 px-2 py-1 shrink-0 border transition-colors [font-family:var(--font-mono-data)] text-[10px] ${
                  isSelected
                    ? 'border-[color-mix(in_srgb,var(--color-cockpit-accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--color-cockpit-accent)_12%,transparent)] text-foreground'
                    : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
                }`}
              >
                <span className="text-[9px] uppercase font-semibold" style={{ color: changeColor }}>
                  {entry.changeType === 'created' ? '+' : entry.changeType === 'deleted' ? '−' : '~'}
                </span>
                <span>{fileName}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Selected file header */}
      {selectedEntry && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-[var(--color-panel-surface)]/50 shrink-0">
          <span
            className="[font-family:var(--font-mono-data)] text-[9px] uppercase font-semibold px-1 py-0.5 border"
            style={{
              color:
                selectedEntry.changeType === 'created'
                  ? 'var(--color-cockpit-green)'
                  : selectedEntry.changeType === 'deleted'
                    ? 'var(--color-cockpit-red)'
                    : 'var(--color-cockpit-amber)',
              borderColor: 'color-mix(in srgb, currentColor 40%, transparent)',
            }}
          >
            {selectedEntry.changeType}
          </span>
          <span className="[font-family:var(--font-mono-data)] text-[11px] text-foreground truncate">
            {selectedEntry.filePath}
          </span>
        </div>
      )}

      {/* Diff content */}
      <div className="flex-1 overflow-auto">
        {fileTree.length === 0 ? (
          <div className="flex items-center justify-center h-full cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }}>
            -- NO FILES CHANGED --
          </div>
        ) : selectedEntry === null ? (
          <div className="flex items-center justify-center h-full cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }}>
            -- SELECT FILE ABOVE --
          </div>
        ) : selectedEntry.diff ? (
          <DiffView diff={selectedEntry.diff} />
        ) : (
          <div className="p-4 cockpit-label" style={{ color: 'var(--color-cockpit-dim)' }}>
            No diff available for this file.
          </div>
        )}
      </div>
    </div>
  )
}
