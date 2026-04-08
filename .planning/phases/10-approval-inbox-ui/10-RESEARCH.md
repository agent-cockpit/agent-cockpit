# Phase 10: Approval Inbox UI - Research

**Researched:** 2026-04-08
**Domain:** React/Zustand/WebSocket UI — approval inbox panel
**Confidence:** HIGH

## Summary

Phase 10 is a pure gap-closure phase. The daemon backend is 100% complete: `approval_request`
events reach the Zustand store, increment `pendingApprovals` counters, and `approvalQueue.decide()`
in the daemon handles all three decision types (`approve`, `deny`, `always_allow`). The WebSocket
handler in `packages/daemon/src/ws/handlers.ts` already listens for `approval_decision` messages
and routes them correctly.

The entire gap lives in the UI layer. Three things need to be built:

1. **Approvals slice in the Zustand store** — the store tracks `pendingApprovals` as a counter
   per session but never stores the `approval_request` event details (proposedAction, riskLevel,
   affectedPaths, whyRisky, actionType) needed to render the inbox. A new `approvalsSlice` must
   accumulate approval_request events and remove them on approval_resolved.

2. **`sendWsMessage` export from `useSessionEvents.ts`** — the module-level `ws` variable is not
   exported. No `ws.send()` call exists anywhere in the UI. Approving a decision requires sending
   `{ type: 'approval_decision', approvalId, decision }` over the existing WebSocket connection.
   The solution is to export a `sendWsMessage(msg: object): void` function from `useSessionEvents.ts`
   that sends JSON if `ws?.readyState === WebSocket.OPEN`.

3. **`ApprovalInbox.tsx` full implementation** — the file is a 7-line stub. It needs to: read
   pending approvals from the store filtered to the current session, render each with full detail,
   and call `sendWsMessage` when the user clicks Approve / Deny / Always Allow.

The route and lazy-loading for `ApprovalInbox` already exist in `router.tsx`. The component
receives the session context from `useParams` (same pattern as `TimelinePanel` and `MemoryPanel`).

**Primary recommendation:** Three-plan split: (1) approvalsSlice + sendWsMessage, (2) ApprovalInbox full implementation with RTL tests, (3) integration test verifying end-to-end decision flow.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| APPR-01 | User can see all pending approvals from Claude and Codex in a single unified inbox | approvalsSlice stores approval_request events; ApprovalInbox reads all pending approvals across providers filtered by sessionId |
| APPR-02 | User can see each approval classified by type and risk level | ApprovalRequestEvent schema has actionType (6 types) and riskLevel (low/medium/high/critical) — render both in the inbox card |
| APPR-03 | User can approve once, deny once, or always-allow a similar action within the session | sendWsMessage({ type: 'approval_decision', approvalId, decision: 'approve'|'deny'|'always_allow' }) — daemon handler already ready |
| APPR-04 | User can inspect an approval in detail (proposed action, reason, affected files, "why risky" hint) | ApprovalRequestEvent schema has proposedAction, whyRisky, affectedPaths — render all in the inbox card |
</phase_requirements>

---

## Standard Stack

### Core (already installed — no new packages needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zustand | ^5.0.11 | Approval state slice | Already powering sessions/events/history slices |
| react | ^18.3.0 | Component rendering | Project standard |
| react-router | ^7.0.0 | useParams for sessionId | Already used by TimelinePanel, MemoryPanel |
| tailwindcss | ^4.0.0 | Styling | Project standard |
| @testing-library/react | ^16.0.0 | RTL component tests | All panels use this pattern |
| vitest | ^3.0.0 | Test runner | Project standard |

### No new packages required
All dependencies for this phase are already installed. The approval data model is already defined
in `@cockpit/shared` (ApprovalRequestEvent schema). No UI library additions needed.

**Installation:** Nothing to install.

---

## Architecture Patterns

### Recommended File Changes
```
packages/ui/src/
├── store/
│   ├── index.ts              # Add ApprovalsSlice interface + slice state
│   ├── approvalsSlice.ts     # NEW — accumulates pending approval_request events
│   └── eventsSlice.ts        # Unchanged (events replay still needed)
├── hooks/
│   └── useSessionEvents.ts   # ADD: export sendWsMessage function
└── components/panels/
    └── ApprovalInbox.tsx     # REPLACE stub with full implementation
packages/ui/src/__tests__/
    ├── approvalsSlice.test.ts # NEW — unit tests for slice reducers
    └── ApprovalInbox.test.tsx # NEW — RTL tests for inbox component
```

### Pattern 1: ApprovalsSlice — Pending Approval Map

The store currently tracks `pendingApprovals: number` per session (counter only). Phase 10 needs
the actual approval event data to render the inbox. The pattern follows `eventsSlice.ts` exactly:
a `Record<string, ApprovalRequestEvent[]>` keyed by sessionId, populated on `approval_request`,
pruned on `approval_resolved`.

```typescript
// packages/ui/src/store/approvalsSlice.ts
// Source: derived from existing eventsSlice.ts pattern
import type { NormalizedEvent } from '@cockpit/shared'
import type { AppStore } from './index.js'

export interface PendingApproval {
  approvalId: string
  sessionId: string
  actionType: string
  riskLevel: string
  proposedAction: string
  affectedPaths: string[]
  whyRisky: string
  timestamp: string
}

export function applyEventToApprovals(
  state: Pick<AppStore, 'pendingApprovalsBySession'>,
  event: NormalizedEvent,
): Pick<AppStore, 'pendingApprovalsBySession'> {
  if (event.type === 'approval_request') {
    const existing = state.pendingApprovalsBySession[event.sessionId] ?? []
    // Dedup by approvalId (same safety as eventsSlice seqNumber dedup)
    if (existing.some((a) => a.approvalId === event.approvalId)) return state
    const approval: PendingApproval = {
      approvalId: event.approvalId,
      sessionId: event.sessionId,
      actionType: event.actionType,
      riskLevel: event.riskLevel,
      proposedAction: event.proposedAction,
      affectedPaths: event.affectedPaths ?? [],
      whyRisky: event.whyRisky ?? '',
      timestamp: event.timestamp,
    }
    return {
      pendingApprovalsBySession: {
        ...state.pendingApprovalsBySession,
        [event.sessionId]: [...existing, approval],
      },
    }
  }
  if (event.type === 'approval_resolved') {
    const existing = state.pendingApprovalsBySession[event.sessionId] ?? []
    const filtered = existing.filter((a) => a.approvalId !== event.approvalId)
    return {
      pendingApprovalsBySession: {
        ...state.pendingApprovalsBySession,
        [event.sessionId]: filtered,
      },
    }
  }
  return state
}
```

### Pattern 2: sendWsMessage Export

The `ws` variable in `useSessionEvents.ts` is module-level but not exported. The minimal change
is to export a `sendWsMessage` function alongside `connectDaemon` and `useSessionEvents`. This
keeps the singleton pattern intact and avoids exposing the raw `ws` reference.

```typescript
// packages/ui/src/hooks/useSessionEvents.ts (addition only)
// Source: audit finding — ws not exported, no ws.send() in UI
export function sendWsMessage(msg: object): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}
```

Decision message format (matches daemon handler in `packages/daemon/src/ws/handlers.ts`):
```typescript
sendWsMessage({
  type: 'approval_decision',
  approvalId: string,           // UUID from ApprovalRequestEvent
  decision: 'approve' | 'deny' | 'always_allow'
})
```

### Pattern 3: ApprovalInbox Component Structure

Follows same pattern as `MemoryPanel.tsx` and `TimelinePanel.tsx`: `useParams` for sessionId,
`useStore` for data, local state for optimistic UI.

```typescript
// packages/ui/src/components/panels/ApprovalInbox.tsx
// Source: derived from MemoryPanel.tsx pattern + audit requirements
import { useParams } from 'react-router'
import { useStore } from '../../store/index.js'
import { sendWsMessage } from '../../hooks/useSessionEvents.js'

export function ApprovalInbox() {
  const { sessionId } = useParams<{ sessionId: string }>()
  // Read pending approvals for this session from store
  const approvals = useStore((s) =>
    s.pendingApprovalsBySession[sessionId ?? ''] ?? EMPTY_APPROVALS
  )

  function handleDecision(
    approvalId: string,
    decision: 'approve' | 'deny' | 'always_allow'
  ) {
    sendWsMessage({ type: 'approval_decision', approvalId, decision })
    // Optimistic removal — store will confirm via approval_resolved event
  }

  if (approvals.length === 0) {
    return <EmptyState />
  }
  return (
    <div className="flex flex-col gap-3 p-4 overflow-y-auto h-full">
      {approvals.map((approval) => (
        <ApprovalCard
          key={approval.approvalId}
          approval={approval}
          onDecide={handleDecision}
        />
      ))}
    </div>
  )
}
```

### Pattern 4: Store Integration

`applyEvent` in `store/index.ts` must call `applyEventToApprovals` alongside the existing slices:

```typescript
// store/index.ts — applyEvent action
applyEvent: (event) =>
  set((state) => ({
    ...applyEventToSessions(state, event),
    ...applyEventToEvents(state, event),
    ...applyEventToApprovals(state, event),  // ADD
  })),
```

And the `AppStore` type and initial state must include:
```typescript
interface ApprovalsSlice {
  pendingApprovalsBySession: Record<string, PendingApproval[]>
}
// Initial: pendingApprovalsBySession: {}
```

### Anti-Patterns to Avoid

- **Fetching approvals from REST API:** All needed data arrives over WebSocket as `approval_request` events and is already in the store replay. No REST endpoint needed for pending approvals.
- **Exporting raw `ws` variable:** Exposes mutable singleton. Export `sendWsMessage` function only — encapsulates readyState guard.
- **Storing approval state in component local state:** The store already tracks `pendingApprovals` count per session. Deriving inbox items from component-local state would desync with the count badge on `SessionCard` and `AgentHoverCard`.
- **Not deduplicating by approvalId:** The catch-up replay on reconnect will replay historical `approval_request` events. Without dedup, already-resolved approvals could reappear.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Risk level color badges | Custom color logic | Tailwind conditional classes | Simple enum with 4 values — no library needed |
| Approval list empty state | Custom spinner/placeholder | Plain div with text (same pattern as other panels) | Other panels use same minimal approach |
| WebSocket message sending | Custom WebSocket wrapper | Export `sendWsMessage` from existing hook | Module-level singleton already handles reconnect |
| Approval detail modal | New modal/dialog component | Inline expand in the card (same as `InlineDetail` in TimelinePanel) | Stays consistent with existing panel UX |

**Key insight:** All backend machinery is done. This phase is entirely additive UI wiring — no new protocols, no new REST endpoints, no new libraries.

---

## Common Pitfalls

### Pitfall 1: Forgetting dedup on catch-up replay
**What goes wrong:** When the browser reconnects, the daemon replays ALL events from `lastSeenSequence`. If `applyEventToApprovals` doesn't dedup by `approvalId`, a resolved approval can reappear because `approval_request` (seq 5) is replayed after `approval_resolved` (seq 6) has already been applied.
**Why it happens:** Catch-up events arrive in sequence order, so request always precedes resolved. But if the store has already seen the resolved event (from a prior partial replay), adding the request event again creates a ghost.
**How to avoid:** Dedup by `approvalId` on insertion, exactly as `eventsSlice` deduplicates by `sequenceNumber`.
**Warning signs:** Resolved approvals appearing in the inbox after browser reconnect.

### Pitfall 2: ws not open when decision is sent
**What goes wrong:** User clicks Approve before WebSocket reconnects. `sendWsMessage` silently no-ops (readyState !== OPEN). The agent stays blocked.
**Why it happens:** Module-level singleton — if `ws` is null or connecting, send is dropped.
**How to avoid:** Disable decision buttons when `wsStatus !== 'connected'` (read from store: `useStore((s) => s.wsStatus)`). Show a "Reconnecting..." indicator.
**Warning signs:** Approvals not resolving after clicking buttons during a reconnect window.

### Pitfall 3: Stale selector causing infinite re-render
**What goes wrong:** `useStore((s) => s.pendingApprovalsBySession[sessionId] ?? [])` returns new `[]` reference on every render when there are no approvals.
**Why it happens:** Same pattern as `useFilteredSessions` — Zustand's `useSyncExternalStore` detects "new" snapshot on every call.
**How to avoid:** Export a `EMPTY_APPROVALS: PendingApproval[] = []` constant from `approvalsSlice.ts` (same as `EMPTY_EVENTS` in `eventsSlice.ts`). Use `?? EMPTY_APPROVALS` not `?? []`.
**Warning signs:** React 18 strict mode infinite render or "getSnapshot should be cached" warnings.

### Pitfall 4: decision string mismatch with daemon
**What goes wrong:** UI sends `decision: 'approved'` but daemon handler checks for `'approve'`.
**Why it happens:** Confusion between the decision verb (what UI sends: `'approve'`) and the status noun (what SQLite stores: `'approved'`).
**How to avoid:** Check daemon handler in `packages/daemon/src/ws/handlers.ts` line 46: accepted values are `'approve' | 'deny' | 'always_allow'`. UI must send these exact strings.
**Warning signs:** Buttons click but nothing happens — daemon's `if (decision === 'approve' || ...)` check falls through silently.

### Pitfall 5: RTL tests hang on unresolved fetch
**What goes wrong:** ApprovalInbox doesn't need any fetch calls — all data comes from the Zustand store. But if a test imports a module that causes a side-effect fetch, RTL will warn about async state updates.
**Why it happens:** Prior panels (MemoryPanel) do fetch; copy-paste from those templates could drag in fetch setup.
**How to avoid:** ApprovalInbox tests should NOT mock `global.fetch`. Seed the store directly using `useStore.setState()`. No async required.

---

## Code Examples

### ApprovalRequestEvent shape (from @cockpit/shared)
```typescript
// Source: packages/shared/src/events.ts
{
  schemaVersion: 1,
  sequenceNumber: 42,         // assigned by SQLite
  sessionId: "uuid",
  timestamp: "2026-...",
  type: 'approval_request',
  approvalId: "uuid",
  actionType: 'shell_command' | 'file_change' | 'network_access' |
              'sandbox_escalation' | 'mcp_tool_call' | 'user_input',
  riskLevel: 'low' | 'medium' | 'high' | 'critical',
  proposedAction: "rm -rf /tmp/foo",
  affectedPaths: ["/tmp/foo"],  // optional
  whyRisky: "Deletes files permanently",  // optional
}
```

### Daemon WebSocket decision message format
```typescript
// Source: packages/daemon/src/ws/handlers.ts lines 39-48
// Accepted by daemon:
ws.send(JSON.stringify({
  type: 'approval_decision',
  approvalId: 'uuid-here',
  decision: 'approve' | 'deny' | 'always_allow'
}))
// daemon calls approvalQueue.decide(approvalId, decision, db)
// which emits approval_resolved event back over WebSocket
```

### RTL test pattern for ApprovalInbox (no fetch needed)
```typescript
// Source: derived from sessionsSlice.test.ts + OpsLayout.test.tsx pattern
import { useStore } from '../store/index.js'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ApprovalInbox } from '../components/panels/ApprovalInbox.js'

const SESSION_ID = '00000000-0000-0000-0000-000000000001'

function renderInbox() {
  render(
    <MemoryRouter initialEntries={[`/session/${SESSION_ID}/approvals`]}>
      <Routes>
        <Route path="/session/:sessionId/approvals" element={<ApprovalInbox />} />
      </Routes>
    </MemoryRouter>
  )
}

// Seed store directly — no fetch mock needed
useStore.setState({
  pendingApprovalsBySession: {
    [SESSION_ID]: [{
      approvalId: 'appr-uuid-1',
      sessionId: SESSION_ID,
      actionType: 'shell_command',
      riskLevel: 'high',
      proposedAction: 'rm -rf /tmp',
      affectedPaths: ['/tmp'],
      whyRisky: 'Deletes files',
      timestamp: '2026-01-01T00:00:00.000Z',
    }]
  }
})
```

### Optimistic removal pattern
```typescript
// Source: derived from MemoryPanel.tsx dismissedIds pattern (Phase 7)
const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set())

function handleDecision(approvalId: string, decision: 'approve' | 'deny' | 'always_allow') {
  sendWsMessage({ type: 'approval_decision', approvalId, decision })
  setDecidedIds((prev) => new Set([...prev, approvalId]))
}

// Filter in render:
const visibleApprovals = approvals.filter((a) => !decidedIds.has(a.approvalId))
// The store will confirm removal via approval_resolved event from daemon
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| ApprovalInbox was a Phase 3 stub | Must be fully implemented in Phase 10 | No behavior change — pure addition |
| `ws` module-level, not exported | Export `sendWsMessage` function | Minimal diff to existing hook |
| `pendingApprovals` counter only in store | Add `pendingApprovalsBySession` map with full event data | Extends existing slice pattern |

**Deprecated/outdated:**
- Stub comment "Pending approvals will appear here in Phase 3" — remove in implementation.

---

## Open Questions

1. **Should ApprovalInbox show ALL session approvals or only the selected session?**
   - What we know: Component receives `sessionId` from `useParams` (same as TimelinePanel). The router path is `/session/:sessionId/approvals`.
   - What's unclear: Whether a global inbox across all sessions would be more useful.
   - Recommendation: Scope to current session per the success criteria ("Pending approvals from the Zustand store are listed in ApprovalInbox with session context visible"). Per-session is the correct scope.

2. **Should wsStatus gate disable the decision buttons?**
   - What we know: `sendWsMessage` silently no-ops when not connected. Daemon retries reconnect automatically.
   - Recommendation: Disable Approve/Deny/Always-Allow buttons when `wsStatus !== 'connected'` and show a small reconnecting badge. Prevents silent failures.

3. **Session context in the inbox header**
   - What we know: The approval card needs to show session context (success criteria item 1).
   - Recommendation: Read `useStore((s) => s.sessions[sessionId])` and display provider + workspacePath in the inbox header — same approach as SessionDetailPanel.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x + @testing-library/react 16 |
| Config file | `packages/ui/vitest.config.ts` |
| Quick run command | `pnpm --filter @cockpit/ui test --run` |
| Full suite command | `pnpm --filter @cockpit/ui test --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| APPR-01 | Pending approvals rendered in inbox | unit | `pnpm --filter @cockpit/ui test --run ApprovalInbox` | ❌ Wave 0 |
| APPR-02 | actionType + riskLevel shown per card | unit | `pnpm --filter @cockpit/ui test --run ApprovalInbox` | ❌ Wave 0 |
| APPR-03 | Decision buttons call sendWsMessage with correct payload | unit | `pnpm --filter @cockpit/ui test --run ApprovalInbox` | ❌ Wave 0 |
| APPR-04 | proposedAction, whyRisky, affectedPaths rendered | unit | `pnpm --filter @cockpit/ui test --run ApprovalInbox` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @cockpit/ui test --run`
- **Per wave merge:** `pnpm --filter @cockpit/ui test --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/ui/src/__tests__/approvalsSlice.test.ts` — covers APPR-01, APPR-04 (slice reducers)
- [ ] `packages/ui/src/__tests__/ApprovalInbox.test.tsx` — covers APPR-01, APPR-02, APPR-03, APPR-04

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `packages/daemon/src/ws/handlers.ts` — approval_decision message format verified
- Direct code inspection: `packages/shared/src/events.ts` — ApprovalRequestEvent schema
- Direct code inspection: `packages/ui/src/store/index.ts` — current Zustand store shape
- Direct code inspection: `packages/ui/src/hooks/useSessionEvents.ts` — ws module-level var not exported
- Direct code inspection: `packages/ui/src/components/panels/ApprovalInbox.tsx` — confirmed 7-line stub
- Direct code inspection: `.planning/v1.0-MILESTONE-AUDIT.md` — gap evidence verbatim

### Secondary (MEDIUM confidence)
- Derived from `eventsSlice.ts` EMPTY_EVENTS pattern — applied to EMPTY_APPROVALS constant
- Derived from `MemoryPanel.tsx` dismissedIds pattern — applied to optimistic removal
- Derived from `selectors.ts` useRef memoization — informing EMPTY_APPROVALS recommendation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed, verified in package.json
- Architecture: HIGH — daemon protocol verified in source, store patterns verified from prior phases
- Pitfalls: HIGH — dedup pattern from eventsSlice, reconnect guard from wsSlice, stable reference from selectors

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable — no external APIs)
