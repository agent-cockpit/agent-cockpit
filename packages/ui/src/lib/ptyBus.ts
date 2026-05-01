type PtyHandler = (data: string) => void

const handlers = new Map<string, Set<PtyHandler>>()

export const ptyBus = {
  subscribe(sessionId: string, handler: PtyHandler): () => void {
    if (!handlers.has(sessionId)) handlers.set(sessionId, new Set())
    handlers.get(sessionId)!.add(handler)
    return () => { handlers.get(sessionId)?.delete(handler) }
  },
  emit(sessionId: string, data: string): void {
    handlers.get(sessionId)?.forEach((h) => h(data))
  },
}
