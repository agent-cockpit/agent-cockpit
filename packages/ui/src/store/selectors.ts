import { useRef } from 'react'
import { useStore } from './index.js'
import type { SessionRecord } from './index.js'

function getFilteredSorted(sessions: Record<string, SessionRecord>, filters: { provider: string | null; status: string | null; search: string }): SessionRecord[] {
  return Object.values(sessions)
    .filter((s) => {
      if (filters.provider && s.provider !== filters.provider) return false
      if (filters.status && s.status !== filters.status) return false
      if (filters.search && !s.workspacePath.toLowerCase().includes(filters.search.toLowerCase())) return false
      return true
    })
    .sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt))
}

function shallowArrayEqual(a: SessionRecord[], b: SessionRecord[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Returns filtered+sorted sessions.
 * Uses useRef to memoize the array reference so React 18's useSyncExternalStore
 * consistency check receives a stable snapshot when content hasn't changed.
 * (Avoids "getSnapshot should be cached" infinite loop warning.)
 */
export function useFilteredSessions(): SessionRecord[] {
  const cacheRef = useRef<SessionRecord[]>([])

  return useStore((state) => {
    const next = getFilteredSorted(state.sessions, state.filters)
    if (shallowArrayEqual(cacheRef.current, next)) {
      return cacheRef.current
    }
    cacheRef.current = next
    return next
  })
}
