import { useState, useCallback, useEffect } from 'react'
import { DAEMON_URL } from '../../lib/daemonUrl.js'

export interface Workflow {
  id: string
  name: string
  sessionIds: string[]
}

const STORAGE_KEY = 'cockpit.terminal.workflows.v2'

function readWorkflows(): Workflow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (w): w is Workflow =>
        w !== null &&
        typeof w === 'object' &&
        typeof (w as Record<string, unknown>).id === 'string' &&
        typeof (w as Record<string, unknown>).name === 'string' &&
        Array.isArray((w as Record<string, unknown>).sessionIds),
    )
  } catch {
    return []
  }
}

function write(workflows: Workflow[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows))
  } catch {
    // ignore
  }
}

function registerWorkflowInDaemon(id: string, name: string): void {
  fetch(`${DAEMON_URL}/api/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name }),
  }).catch(() => {})
}

export function useWorkflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>(readWorkflows)

  // Sync all existing workflows to daemon on mount (after restart)
  useEffect(() => {
    const all = readWorkflows()
    for (const wf of all) registerWorkflowInDaemon(wf.id, wf.name)
  }, [])

  const addWorkflow = useCallback((name: string): Workflow => {
    const workflow: Workflow = { id: crypto.randomUUID(), name, sessionIds: [] }
    setWorkflows((prev) => {
      const next = [...prev, workflow]
      write(next)
      return next
    })
    registerWorkflowInDaemon(workflow.id, workflow.name)
    return workflow
  }, [])

  const removeWorkflow = useCallback((id: string) => {
    setWorkflows((prev) => {
      const next = prev.filter((w) => w.id !== id)
      write(next)
      return next
    })
  }, [])

  const addSessionToWorkflow = useCallback((workflowId: string, sessionId: string) => {
    setWorkflows((prev) => {
      const next = prev.map((w) =>
        w.id === workflowId && !w.sessionIds.includes(sessionId)
          ? { ...w, sessionIds: [...w.sessionIds, sessionId] }
          : w,
      )
      write(next)
      return next
    })
  }, [])

  return { workflows, addWorkflow, removeWorkflow, addSessionToWorkflow }
}
