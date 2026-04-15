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
  const { sessionId: paramSessionId } = useParams<{ sessionId: string }>()
  const storeSessionId = useStore((s) => s.selectedSessionId)
  const sessionId = paramSessionId ?? storeSessionId ?? ''
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
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-[var(--color-panel-surface)]">
        <span className="data-readout text-[10px]">
          <span className="data-readout-dim">FILES:&nbsp;</span>
          <span className="tabular-nums">{String(filesTouched).padStart(2, '0')}</span>
        </span>
        <span className="[font-family:var(--font-mono-data)] text-[10px] uppercase tracking-wide"
              style={{ color: finalStatus === 'active' ? 'var(--color-cockpit-green)' : finalStatus === 'error' ? 'var(--color-cockpit-red)' : 'var(--color-cockpit-dim)' }}>
          {finalStatus}
        </span>
        {elapsedMs !== null && (
          <span className="data-readout-dim text-[10px] tabular-nums">{formatElapsed(elapsedMs)}</span>
        )}
      </div>

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
