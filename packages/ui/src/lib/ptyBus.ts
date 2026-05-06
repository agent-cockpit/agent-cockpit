type PtyHandler = (data: string) => void

const handlers = new Map<string, Set<PtyHandler>>()
const buffers = new Map<string, string[]>()
const MAX_BUFFER_CHARS = 2_000_000

function appendToBuffer(sessionId: string, data: string): void {
  const buffer = buffers.get(sessionId) ?? []
  buffer.push(data)

  let totalLength = 0
  for (let i = buffer.length - 1; i >= 0; i--) {
    totalLength += buffer[i]!.length
    if (totalLength > MAX_BUFFER_CHARS) {
      buffer.splice(0, i + 1)
      break
    }
  }

  buffers.set(sessionId, buffer)
}

export const ptyBus = {
  subscribe(sessionId: string, handler: PtyHandler): () => void {
    if (!handlers.has(sessionId)) handlers.set(sessionId, new Set())
    handlers.get(sessionId)!.add(handler)
    buffers.get(sessionId)?.forEach((chunk) => handler(chunk))
    return () => { handlers.get(sessionId)?.delete(handler) }
  },
  emit(sessionId: string, data: string): void {
    appendToBuffer(sessionId, data)
    handlers.get(sessionId)?.forEach((h) => h(data))
  },
  clear(sessionId: string): void {
    buffers.delete(sessionId)
    handlers.delete(sessionId)
  },
  clearAll(): void {
    buffers.clear()
    handlers.clear()
  },
}
