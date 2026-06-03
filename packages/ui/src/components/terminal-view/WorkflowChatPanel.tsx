import { useEffect } from 'react'
import { useStore, type WorkflowMessage } from '../../store/index.js'
import { DAEMON_URL } from '../../lib/daemonUrl.js'
import type { Workflow } from './useWorkflows.js'

interface Props {
  workflow: Workflow
  allWorkflows: Workflow[]
}

const MONO: React.CSSProperties = { fontFamily: '"DM Mono", ui-monospace, SFMono-Regular, Menlo, monospace' }
const UI: React.CSSProperties = { fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function WorkflowChatPanel({ workflow, allWorkflows }: Props) {
  const workflowMessages = useStore((s) => s.workflowMessages)
  const messages = workflowMessages[workflow.id] ?? []
  const setWorkflowMessages = useStore((s) => s.setWorkflowMessages)

  // Load existing messages on mount or workflow change
  useEffect(() => {
    fetch(`${DAEMON_URL}/api/workflows/${encodeURIComponent(workflow.id)}/messages`)
      .then((r) => r.ok ? r.json() as Promise<WorkflowMessage[]> : [])
      .then((msgs) => setWorkflowMessages(workflow.id, msgs))
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow.id])

  function workflowName(id: string): string {
    if (id === workflow.id) return workflow.name
    return allWorkflows.find((w) => w.id === id)?.name ?? id.slice(0, 8)
  }

  if (messages.length === 0) {
    return (
      <div style={{ padding: '16px', textAlign: 'center' }}>
        <p style={{ ...MONO, fontSize: '10px', color: 'var(--w-muted)', letterSpacing: '0.1em' }}>
          no messages yet
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', padding: '8px 0' }}>
      {messages.map((msg) => {
        const isOutbound = msg.fromWorkflowId === workflow.id
        return (
          <div
            key={msg.id}
            style={{
              padding: '6px 14px',
              borderLeft: isOutbound
                ? '2px solid var(--color-cockpit-accent)'
                : '2px solid var(--w-muted)',
              marginLeft: '8px',
              marginRight: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
              <span style={{ ...MONO, fontSize: '9px', color: isOutbound ? 'var(--color-cockpit-accent)' : 'var(--w-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {isOutbound
                  ? `→ ${workflowName(msg.toWorkflowId)}`
                  : `← ${workflowName(msg.fromWorkflowId)}`}
              </span>
              <span style={{ ...MONO, fontSize: '9px', color: 'var(--w-muted)' }}>
                {formatTime(msg.createdAt)}
              </span>
            </div>
            <p style={{ ...UI, fontSize: '12px', color: 'var(--w-body)', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {msg.content}
            </p>
          </div>
        )
      })}
    </div>
  )
}
