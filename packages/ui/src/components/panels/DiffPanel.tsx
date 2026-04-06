import { useState } from 'react'
import { useParams } from 'react-router'
import type { NormalizedEvent } from '@cockpit/shared'
import { useStore } from '../../store/index.js'
import { EMPTY_EVENTS } from '../../store/eventsSlice.js'

interface FileEntry {
  filePath: string
  changeType: 'created' | 'modified' | 'deleted'
  diff?: string
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function deriveFileTree(events: NormalizedEvent[]): FileEntry[] {
  const map = new Map<string, FileEntry>()
  for (const event of events) {
    if (event.type === 'file_change') {
      map.set(event.filePath, {
        filePath: event.filePath,
        changeType: event.changeType,
        diff: event.diff,
      })
    }
  }
  return [...map.values()].sort((a, b) => a.filePath.localeCompare(b.filePath))
}

function formatElapsed(ms: number): string {
  if (ms < 60000) {
    return `${Math.floor(ms / 1000)}s`
  }
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

function DiffView({ diff }: { diff: string }) {
  const lines = diff.split('\n')
  return (
    <pre className="text-xs font-mono overflow-x-auto p-3">
      {lines.map((line, i) => {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          return (
            <div
              key={i}
              data-testid="diff-line-add"
              className="text-green-600 bg-green-50"
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
              className="text-red-600 bg-red-50"
            >
              {line}
            </div>
          )
        }
        if (line.startsWith('@')) {
          return (
            <div key={i} className="text-blue-500">
              {line}
            </div>
          )
        }
        return <div key={i}>{line}</div>
      })}
    </pre>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DiffPanel() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const events = useStore((s) => s.events[sessionId!] ?? EMPTY_EVENTS)
  const session = useStore((s) => (sessionId ? s.sessions[sessionId] : undefined))
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)

  // Derived values
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

  return (
    <div className="flex flex-col h-full">
      {/* Summary banner */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border text-sm">
        <span>
          {filesTouched} {filesTouched === 1 ? 'file' : 'files'} changed
        </span>
        <span className="capitalize">{finalStatus}</span>
        {elapsedMs !== null && <span>{formatElapsed(elapsedMs)}</span>}
      </div>

      {/* Body: file tree + diff view */}
      <div className="flex flex-1 overflow-hidden">
        {/* File tree */}
        <div className="w-64 border-r border-border overflow-y-auto">
          {fileTree.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No files changed</div>
          ) : (
            fileTree.map((entry) => (
              <div
                key={entry.filePath}
                data-testid="file-tree-row"
                onClick={() => setSelectedFilePath(entry.filePath)}
                className={`px-3 py-2 cursor-pointer text-xs font-mono hover:bg-muted/50 ${
                  entry.filePath === selectedFilePath ? 'bg-muted font-semibold' : ''
                }`}
              >
                <div>{entry.filePath.split('/').pop()}</div>
                <div className="text-muted-foreground truncate">{entry.filePath}</div>
                <span className="text-[10px] uppercase">{entry.changeType}</span>
              </div>
            ))
          )}
        </div>

        {/* Diff view */}
        <div className="flex-1 overflow-auto">
          {selectedEntry === null ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Select a file to view its diff
            </div>
          ) : selectedEntry.diff ? (
            <DiffView diff={selectedEntry.diff} />
          ) : (
            <div className="p-4 text-sm text-muted-foreground">No diff available</div>
          )}
        </div>
      </div>
    </div>
  )
}
