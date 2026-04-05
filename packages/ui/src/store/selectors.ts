import { useStore } from './index.js'
import type { SessionRecord } from './index.js'

function shallowArrayEqual(a: SessionRecord[], b: SessionRecord[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export function useFilteredSessions(): SessionRecord[] {
  return useStore((state) => {
    const { sessions, filters } = state
    return Object.values(sessions)
      .filter((s) => {
        if (filters.provider && s.provider !== filters.provider) return false
        if (filters.status && s.status !== filters.status) return false
        if (filters.search && !s.workspacePath.toLowerCase().includes(filters.search.toLowerCase())) return false
        return true
      })
      .sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt))
  }, shallowArrayEqual)
}
