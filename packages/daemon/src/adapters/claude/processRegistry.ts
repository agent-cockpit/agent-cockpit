import type { IPty } from 'node-pty'

const registry = new Map<string, IPty>()

export function registerProcess(sessionId: string, pty: IPty): void {
  registry.set(sessionId, pty)
  console.log(`[processRegistry] registered session ${sessionId} (pid=${pty.pid})`)
}

export function removeProcess(sessionId: string): void {
  registry.delete(sessionId)
}

/** Returns true when cockpit owns this session's process (can send input). */
export function isControllable(sessionId: string): boolean {
  return registry.has(sessionId)
}

/** Write text + newline to the session's Claude process stdin. Returns false if not found. */
export function sendInputToSession(sessionId: string, text: string): boolean {
  const pty = registry.get(sessionId)
  if (!pty) return false
  pty.write(text + '\r')
  return true
}
