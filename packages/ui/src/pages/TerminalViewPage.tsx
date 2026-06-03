import { useEffect, useState } from 'react'
import { useWorkflows } from '../components/terminal-view/useWorkflows.js'
import { WorkspaceSidebar } from '../components/terminal-view/WorkspaceSidebar.js'
import { SessionListPane } from '../components/terminal-view/SessionListPane.js'
import { MainTerminalPane } from '../components/terminal-view/MainTerminalPane.js'
import { PopupWindowLayer } from '../components/terminal-view/PopupWindowLayer.js'
import { NewWorkflowModal } from '../components/terminal-view/NewWorkflowModal.js'
import { LaunchSessionModal } from '../components/sessions/LaunchSessionModal.js'
import { useStore } from '../store/index.js'

const WARP: Record<string, string> = {
  '--w-canvas':      'var(--color-background)',
  '--w-canvas-soft': 'var(--color-sidebar)',
  '--w-hairline':    'var(--color-border)',
  '--w-ink':         'var(--color-foreground)',
  '--w-body-strong': 'oklch(0.72 0.018 260)',
  '--w-body':        'var(--color-muted-foreground)',
  '--w-muted':       'var(--color-cockpit-dim)',
  '--w-primary':     'var(--color-foreground)',
  '--w-on-primary':  'var(--color-background)',
}

export function TerminalViewPage() {
  const { workflows, addWorkflow, removeWorkflow, addSessionToWorkflow } = useWorkflows()
  const sessions = useStore((s) => s.sessions)
  const subagentSessionIds = useStore((s) => s.subagentSessionIds)

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)
  const [newWorkflowOpen, setNewWorkflowOpen] = useState(false)
  const [launchOpen, setLaunchOpen] = useState(false)

  // Auto-select first workflow; deselect removed ones
  useEffect(() => {
    if (selectedWorkflowId === null && workflows.length > 0) {
      setSelectedWorkflowId(workflows[0]!.id)
    }
    if (selectedWorkflowId !== null && !workflows.find((w) => w.id === selectedWorkflowId)) {
      setSelectedWorkflowId(workflows[0]?.id ?? null)
    }
  }, [workflows, selectedWorkflowId])

  const selectedWorkflow = workflows.find((w) => w.id === selectedWorkflowId) ?? null

  // Sessions belong to a workflow only if their sessionId was explicitly registered
  const activeSessions = selectedWorkflow
    ? selectedWorkflow.sessionIds
        .map((id) => sessions[id])
        .filter((s): s is NonNullable<typeof s> =>
          s !== undefined &&
          s.status === 'active' &&
          !subagentSessionIds.has(s.sessionId),
        )
    : []

  function handleNewWorkflow(name: string) {
    const wf = addWorkflow(name)
    setSelectedWorkflowId(wf.id)
  }

  function handleSessionLaunched(sessionId: string) {
    if (selectedWorkflowId) {
      addSessionToWorkflow(selectedWorkflowId, sessionId)
    }
  }

  return (
    <div className="flex h-full overflow-hidden" style={WARP as React.CSSProperties}>
      <WorkspaceSidebar
        workflows={workflows}
        selectedId={selectedWorkflowId}
        onSelect={setSelectedWorkflowId}
        onRemove={removeWorkflow}
        onNew={() => setNewWorkflowOpen(true)}
      />

      <SessionListPane
        workflow={selectedWorkflow}
        activeSessions={activeSessions}
        allWorkflows={workflows}
        onLaunch={() => setLaunchOpen(true)}
      />

      {workflows.length === 0 ? (
        <EmptyState onNew={() => setNewWorkflowOpen(true)} />
      ) : (
        <MainTerminalPane
          sessions={activeSessions}
          onNewSession={() => setLaunchOpen(true)}
        />
      )}

      <PopupWindowLayer />

      <NewWorkflowModal
        open={newWorkflowOpen}
        onClose={() => setNewWorkflowOpen(false)}
        onConfirm={handleNewWorkflow}
      />

      <LaunchSessionModal
        open={launchOpen}
        onClose={() => setLaunchOpen(false)}
        workflowId={selectedWorkflowId ?? undefined}
        onLaunched={handleSessionLaunched}
      />
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6"
      style={{ background: 'var(--w-canvas)' }}>
      <div className="text-center">
        <p style={{ fontFamily: '"DM Mono", ui-monospace, monospace', fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--w-muted)', marginBottom: '20px' }}>
          No workflows
        </p>
        <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '14px', color: 'var(--w-body)', marginBottom: '24px' }}>
          Create a workflow to start launching agents.
        </p>
        <button type="button" onClick={onNew}
          style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '14px', fontWeight: 500, color: 'var(--w-on-primary)', background: 'var(--w-primary)', border: 'none', borderRadius: '3px', padding: '8px 16px', cursor: 'pointer' }}>
          New workflow
        </button>
      </div>
    </div>
  )
}
