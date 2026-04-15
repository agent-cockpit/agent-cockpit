import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import { useStore } from '../../store/index.js'
import { sendWsMessage } from '../../hooks/useSessionEvents.js'
import { ApprovalInbox } from '../panels/ApprovalInbox.js'
import { ChatPanel } from '../panels/ChatPanel.js'
import { TimelinePanel } from '../panels/TimelinePanel.js'
import { DiffPanel } from '../panels/DiffPanel.js'
import { MemoryPanel } from '../panels/MemoryPanel.js'
import { ArtifactsPanel } from '../panels/ArtifactsPanel.js'

interface Props {
  open: boolean
  onClose: () => void
}

const TAB_IDS = ['approvals', 'chat', 'timeline', 'diff', 'memory', 'artifacts'] as const
type TabId = typeof TAB_IDS[number]

const TAB_LABELS: Record<TabId, string> = {
  approvals: 'Approvals',
  chat: 'Chat',
  timeline: 'Timeline',
  diff: 'Diff',
  memory: 'Memory',
  artifacts: 'Artifacts',
}

export function InstancePopupHub({ open, onClose }: Props) {
  const selectedSessionId = useStore((s) => s.selectedSessionId)
  const popupPreferredTab = useStore((s) => s.popupPreferredTab)
  const setPopupPreferredTab = useStore((s) => s.setPopupPreferredTab)
  const session = useStore((s) =>
    selectedSessionId ? s.sessions[selectedSessionId] : undefined
  )
  const [activeTab, setActiveTab] = useState<TabId>('approvals')
  const [isTerminating, setIsTerminating] = useState(false)
  const [terminateError, setTerminateError] = useState<string | null>(null)

  const projectName = session?.workspacePath.split('/').at(-1) ?? 'Session'

  useEffect(() => {
    if (!open) return
    if (popupPreferredTab && TAB_IDS.includes(popupPreferredTab as TabId)) {
      setActiveTab(popupPreferredTab as TabId)
      setPopupPreferredTab(null)
      return
    }
    setActiveTab('approvals')
  }, [open, popupPreferredTab, setPopupPreferredTab])

  useEffect(() => {
    if (!open) {
      setIsTerminating(false)
      setTerminateError(null)
      return
    }
    setIsTerminating(false)
    setTerminateError(null)
  }, [open, selectedSessionId])

  useEffect(() => {
    if (!isTerminating || !session) return
    if (session.status !== 'active') {
      setIsTerminating(false)
      return
    }
    if (session.reason) {
      setTerminateError(session.reason)
      setIsTerminating(false)
    }
  }, [isTerminating, session])

  function handleTerminate(): void {
    if (!session || !selectedSessionId) return
    if (session.canTerminateSession !== true) {
      setTerminateError(
        session.reason ?? 'Session termination is unavailable for this session.',
      )
      return
    }
    if (!window.confirm(`Terminate session "${projectName}"?`)) {
      return
    }
    setTerminateError(null)
    setIsTerminating(true)
    sendWsMessage({ type: 'session_terminate', sessionId: selectedSessionId })
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                     w-[82vw] max-w-5xl h-[80vh] bg-background rounded-none
                     flex flex-col overflow-hidden border border-border/80
                     shadow-[0_0_40px_rgba(34,211,238,0.08),0_20px_60px_rgba(0,0,0,0.6)]"
          aria-label={`Session: ${projectName}`}
        >
          {/* Header */}
          <div className="cockpit-frame-full flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 bg-[var(--color-panel-surface)]">
            <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
            <span className="cockpit-corner cockpit-corner-tr" aria-hidden />
            <Dialog.Title className="[font-family:var(--font-mono-data)] text-xs font-semibold text-foreground uppercase tracking-widest">
              {projectName}
            </Dialog.Title>
            {session && (
              <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 ${session.provider === 'claude' ? 'badge-provider-claude' : 'badge-provider-codex'}`}>
                {session.provider}
              </span>
            )}
            {session?.status === 'active' && session.canTerminateSession === true && (
              <button
                type="button"
                onClick={handleTerminate}
                disabled={isTerminating}
                className="rounded border border-red-500/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isTerminating ? 'Terminating...' : 'Terminate'}
              </button>
            )}
            {session?.status === 'active' && session.canTerminateSession === false && (
              <span className="text-[10px] text-muted-foreground">
                {session.reason ?? 'Session termination is unavailable for this session.'}
              </span>
            )}
            <Dialog.Close
              className="ml-auto cockpit-label hover:text-foreground transition-colors px-2 py-1"
              aria-label="Close"
            >
              [X]
            </Dialog.Close>
          </div>
          {terminateError && (
            <div className="px-4 py-2 text-xs text-red-500 border-b border-border">
              {terminateError}
            </div>
          )}

          {/* Tabs */}
          <Tabs.Root
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as TabId)}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <Tabs.List className="flex border-b border-border shrink-0 px-4 gap-1">
              {TAB_IDS.map((id) => (
                <Tabs.Trigger
                  key={id}
                  value={id}
                  className="cockpit-tab -mb-px data-[state=active]:text-[color:var(--color-cockpit-cyan)] data-[state=active]:border-b-[color:var(--color-cockpit-cyan)] data-[state=active]:[text-shadow:0_0_4px_var(--color-cockpit-cyan)]"
                >
                  {TAB_LABELS[id]}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <div className="flex-1 overflow-auto">
              <Tabs.Content value="approvals" className="h-full">
                <ApprovalInbox />
              </Tabs.Content>
              <Tabs.Content value="chat" className="h-full">
                <ChatPanel />
              </Tabs.Content>
              <Tabs.Content value="timeline" className="h-full">
                <TimelinePanel />
              </Tabs.Content>
              <Tabs.Content value="diff" className="h-full">
                <DiffPanel />
              </Tabs.Content>
              <Tabs.Content value="memory" className="h-full">
                <MemoryPanel />
              </Tabs.Content>
              <Tabs.Content value="artifacts" className="h-full">
                <ArtifactsPanel />
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
