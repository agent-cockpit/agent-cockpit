import { useState, useEffect, useRef } from 'react'
import { DAEMON_URL } from '../../lib/daemonUrl.js'

interface SearchResult {
  sourceType: 'event' | 'approval' | 'memory_note'
  sourceId: string
  sessionId: string
  snippet: string
}

export function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!query.trim()) { setResults([]); return }
    timerRef.current = setTimeout(() => {
      fetch(`${DAEMON_URL}/api/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((data: SearchResult[]) => setResults(data))
        .catch(() => setResults([]))
    }, 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        placeholder="Search sessions, files, approvals..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
        data-testid="search-input"
      />
      {results.length > 0 && (
        <ul className="flex flex-col gap-1" data-testid="search-results">
          {results.map((r, i) => (
            <li key={i} className="rounded bg-muted p-2 text-xs">
              <span className="font-medium text-muted-foreground">{r.sourceType}</span>
              {' — '}
              {/* Strip HTML tags from snippet for plain text display */}
              <span dangerouslySetInnerHTML={{ __html: r.snippet }} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
