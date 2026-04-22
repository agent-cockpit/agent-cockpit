export function getSessionTitle(workspacePath: string | null | undefined, sessionId?: string): string {
  const raw = (workspacePath ?? '').trim()
  if (raw.length > 0) {
    const normalized = raw.replace(/[\\/]+$/, '')
    if (normalized.length > 0) {
      const parts = normalized.split(/[\\/]/).filter((part) => part.length > 0)
      const leaf = parts[parts.length - 1]
      if (leaf && leaf.length > 0) {
        return leaf
      }
      return normalized
    }
  }

  if (sessionId && sessionId.length > 0) {
    return sessionId.slice(0, 8)
  }

  return 'Session'
}
