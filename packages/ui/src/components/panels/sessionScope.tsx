import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useParams } from 'react-router'
import { useStore } from '../../store/index.js'

const SessionScopeContext = createContext<string | null>(null)

interface SessionScopeProviderProps {
  sessionId: string
  children: ReactNode
}

export function SessionScopeProvider({ sessionId, children }: SessionScopeProviderProps) {
  return (
    <SessionScopeContext.Provider value={sessionId}>
      {children}
    </SessionScopeContext.Provider>
  )
}

export function usePanelSessionId(): string {
  const scopedSessionId = useContext(SessionScopeContext)
  const { sessionId: paramSessionId } = useParams<{ sessionId: string }>()
  const storeSessionId = useStore((s) => s.selectedSessionId)
  return scopedSessionId ?? paramSessionId ?? storeSessionId ?? ''
}
