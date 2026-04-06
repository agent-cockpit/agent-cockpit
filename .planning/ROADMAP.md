# Roadmap: Agent Mission Control

## Overview

The build starts with the daemon — the critical path every other feature depends on. Once the normalized event schema, SQLite persistence, and WebSocket infrastructure are locked, each subsequent phase adds a coherent capability: first the Claude adapter and the full approval round-trip, then the browser UI shell, then the Codex adapter, then the operational panels (timeline, diffs, memory), then search and history, and finally Office mode as an additive display layer on top of proven data. The result is a unified approval, memory, and replay control room for Claude Code and Codex that runs entirely locally.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Daemon Core** - Normalized event schema, SQLite persistence, WebSocket server with sequence-based catch-up (completed 2026-04-05)
- [x] **Phase 2: Claude Adapter + Approval Foundation** - Hook ingestion, full approval round-trip with timeout, in-app and desktop notifications (completed 2026-04-05)
- [x] **Phase 3: Browser UI Shell + Session Management** - Vite/React/Zustand app, live session list, session filtering, Ops mode layout and panels (completed 2026-04-05)
- [x] **Phase 4: Codex Adapter** - Codex app-server integration via stdio JSON-RPC, Codex sessions and approvals in the same UI (completed 2026-04-06)
- [x] **Phase 5: Timeline & Replay** - Replayable ordered event timeline per session with scrubbing, jump-to, and filtering (completed 2026-04-06)
- [ ] **Phase 6: Diff & Artifact Review** - File tree of changed files, per-file raw diff view, session summary
- [ ] **Phase 7: Memory Panel** - Read/edit project memory, create notes, approve agent-suggested memory updates
- [ ] **Phase 8: Session History & Search** - Full-text search across sessions, searchable history list, side-by-side session comparison
- [ ] **Phase 9: Office Mode** - Pixel-art spatial visualization of active agents with state-driven animations and layout persistence

## Phase Details

### Phase 1: Daemon Core
**Goal**: A running local daemon that receives typed events from any adapter, persists them to SQLite, and streams them to the browser over WebSocket — with sequence numbers and reconnect catch-up built in from the first commit.
**Depends on**: Nothing (first phase)
**Requirements**: DAEMON-01, DAEMON-02, DAEMON-03
**Success Criteria** (what must be TRUE):
  1. The `NormalizedEvent` schema with `schemaVersion` and `sequenceNumber` is defined in `packages/shared` and imported by both the daemon and a test harness without any adapter present
  2. Synthetic events injected into the daemon appear in the SQLite database with WAL mode confirmed active and are broadcast over WebSocket to a connected browser tab
  3. A browser tab that disconnects and reconnects with a `lastSeenSequence` receives only the missed events in order, with no duplicates and no gaps
  4. Stopping and restarting the daemon does not lose any previously persisted events; the browser tab recovers full state after reconnect
**Plans**: 3 plans

Plans:
- [ ] 01-01-PLAN.md — Monorepo scaffold + @cockpit/shared NormalizedEvent Zod schema (DAEMON-01)
- [ ] 01-02-PLAN.md — SQLite persistence layer with WAL mode, TDD (DAEMON-02)
- [ ] 01-03-PLAN.md — WebSocket catch-up server + daemon entrypoint wiring, TDD (DAEMON-03)

### Phase 2: Claude Adapter + Approval Foundation
**Goal**: Claude Code sessions are visible in the daemon with real hook events. The full approval round-trip — PreToolUse hook to browser decision back to Claude Code HTTP response — works end-to-end, with per-approval timeout and auto-deny shipping in the same release.
**Depends on**: Phase 1
**Requirements**: DAEMON-04, APPR-01, APPR-02, APPR-03, APPR-04, APPR-05, APPR-06, NOTIF-01, NOTIF-02
**Success Criteria** (what must be TRUE):
  1. Starting a Claude Code session with hooks configured causes session-start, tool-call, and file-change events to appear in the daemon's SQLite database within one second
  2. A pending approval from Claude Code appears in the daemon's approval queue with its type (shell/file/network/MCP), risk level, proposed action, affected files, and "why risky" hint populated
  3. Approving or denying an approval in the daemon delivers the correct HTTP response to Claude Code and records the decision in SQLite; denying unblocks the agent without hanging it
  4. An approval that receives no decision within its configured timeout is automatically denied, an `approval_expired` event is emitted, and the agent continues without deadlocking
  5. All approval decisions (approve/deny/always-allow/timeout) survive a daemon restart and are queryable from the database
  6. An in-app notification fires when an approval is needed, and a desktop OS-level notification fires when the browser tab is in the background
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md — Claude Code hook adapter: HTTP server, hook parser, risk classifier, SQLite schema migrations (DAEMON-04, APPR-02)
- [x] 02-02-PLAN.md — Approval queue + round-trip: in-memory queue, WebSocket decision handler, SQLite persistence (APPR-01, APPR-03, APPR-04, APPR-05, APPR-06)
- [x] 02-03-PLAN.md — Daemon wiring, timeout integration test, notification helpers (APPR-05, APPR-06, NOTIF-01, NOTIF-02)

### Phase 3: Browser UI Shell + Session Management
**Goal**: The browser shows live Claude Code sessions, lets the user filter the list, and provides the Ops mode layout with working navigation between session detail, approval inbox, timeline, diff, memory, and artifacts panels — even before those panels are fully populated.
**Depends on**: Phase 2
**Requirements**: SESS-01, SESS-02, SESS-03, SESS-04, OPS-01, OPS-02, OPS-03, OPS-04
**Success Criteria** (what must be TRUE):
  1. Opening the browser UI at localhost shows all active Claude Code sessions discovered automatically, with status indicators that update in real time as events arrive
  2. The user can filter the session list by project, provider, status, and recency; the list updates immediately without a page reload
  3. Selecting a session opens its detail panel showing task, provider, repo/branch, start time, and current status; switching to another session and back does not lose the first session's panel state
  4. The user can launch a new Claude or Codex session from the browser UI by selecting a repo and provider
  5. The user can attach to an already-running session and begin receiving its events without restarting the daemon
  6. Ops mode navigation between approval inbox, timeline, diff viewer, memory, and artifacts panels works; panels render empty states rather than errors when content is not yet available
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md — Scaffold packages/ui: Vite+React+Zustand store, WebSocket hook, session event derivation (SESS-01, SESS-03)
- [x] 03-02-PLAN.md — Session filters + selectors + POST /api/sessions daemon endpoint + LaunchSessionModal (SESS-02, SESS-04)
- [x] 03-03-PLAN.md — Ops layout shell: SessionListPanel, SessionDetailPanel, panel tabs with empty states (OPS-01, OPS-02, OPS-03, OPS-04)

### Phase 4: Codex Adapter
**Goal**: Codex sessions appear in the same session list and approval inbox as Claude sessions. The adapter handles stdio JSON-RPC, session resume, and Codex approval events without modifying the daemon core or the browser UI.
**Depends on**: Phase 3
**Requirements**: DAEMON-05
**Success Criteria** (what must be TRUE):
  1. Starting a Codex session via `codex app-server` causes session-start, tool-call, and approval events to appear in the daemon alongside any active Claude sessions
  2. A Codex approval request appears in the unified approval inbox with correct type classification; approving or denying it delivers the correct JSON-RPC response to the Codex process
  3. A Codex session can be resumed from the browser UI after the daemon restarts, with prior events replayed from SQLite
  4. A provider parse error from a malformed Codex payload emits a `provider_parse_error` event and does not crash the daemon
**Plans**: 3 plans

Plans:
- [ ] 04-01-PLAN.md — Wave 0 foundation: codex_sessions DB migration + failing test stubs for parser and adapter (DAEMON-05)
- [ ] 04-02-PLAN.md — TDD: codexParser + codexRiskClassifier implementation, all parser tests green (DAEMON-05)
- [ ] 04-03-PLAN.md — CodexAdapter class + wiring into POST /api/sessions and approvalQueue (DAEMON-05)

### Phase 5: Timeline & Replay
**Goal**: Every session has a fully replayable, ordered event timeline the user can scrub, jump through, and filter — enabling after-the-fact review of exactly what the agent did and when.
**Depends on**: Phase 4
**Requirements**: TIMELINE-01, TIMELINE-02, TIMELINE-03, TIMELINE-04
**Success Criteria** (what must be TRUE):
  1. Selecting a session opens its timeline showing all events in order: prompt/task created, plan updates, tool calls, command runs, file changes, approvals requested/resolved, subagent spawn/complete, memory read/write, and completion/failure
  2. The user can jump directly to the first or next approval event or file-change event in the timeline using a dedicated control, without scrolling through all events
  3. The user can filter the timeline by event type (e.g., show only tool calls) and the timeline updates without leaving the panel
  4. Clicking any timeline event opens its related output, diff, or approval detail inline
**Plans**: 3 plans

Plans:
- [ ] 05-01-PLAN.md — Daemon: getEventsBySession query + GET /api/sessions/:id/events endpoint + CORS fix (TIMELINE-01)
- [ ] 05-02-PLAN.md — UI: eventsSlice in Zustand store, applyEvent integration, bulkApplyEvents (TIMELINE-01, TIMELINE-02, TIMELINE-03)
- [ ] 05-03-PLAN.md — TimelinePanel: filter chips, jump-to controls, inline detail, mount hydration (TIMELINE-01, TIMELINE-02, TIMELINE-03, TIMELINE-04)

### Phase 6: Diff & Artifact Review
**Goal**: For any session, the user can see exactly which files the agent changed, inspect the raw diff per file, and read a concise session summary — all without leaving the browser.
**Depends on**: Phase 5
**Requirements**: DIFF-01, DIFF-02, DIFF-03
**Success Criteria** (what must be TRUE):
  1. The diff panel for a completed or in-progress session shows a file tree of every file changed during that session, updated as new file-change events arrive
  2. Clicking any file in the tree opens its raw diff view showing the exact lines added and removed
  3. The session summary shows files touched count, final status (completed/failed/in-progress), and elapsed time
**Plans**: TBD

### Phase 7: Memory Panel
**Goal**: The user can view, edit, and extend project memory from one surface inside the browser — including reading from CLAUDE.md, creating new notes, and approving or rejecting agent-suggested memory updates before they are written to disk.
**Depends on**: Phase 6
**Requirements**: MEM-01, MEM-02, MEM-03, MEM-04
**Success Criteria** (what must be TRUE):
  1. Opening the memory panel for a workspace shows its persistent instructions, project conventions, build/test commands, architecture notes, and prior accepted agent learnings, normalized from provider-specific files (CLAUDE.md, auto memory) into one readable surface
  2. The user can edit CLAUDE.md content directly in the memory panel and save the changes back to disk; a notice informs the user the changes take effect on the next session if a session is currently running
  3. The user can create a new memory note and pin it to the project; the note persists across daemon restarts
  4. An agent-suggested memory update appears in the panel awaiting approval; approving it writes the note to the appropriate memory file; rejecting it discards it without modifying any file
**Plans**: TBD

### Phase 8: Session History & Search
**Goal**: The user can search across everything the system has recorded — sessions, tasks, memory, file changes, approval decisions — and browse or reopen any past session, including a side-by-side comparison of two sessions.
**Depends on**: Phase 7
**Requirements**: HIST-01, HIST-02, COMP-01
**Success Criteria** (what must be TRUE):
  1. Typing a query into the search interface returns matching results across sessions, task titles, memory items, file-change records, and approval history within two seconds, even with more than 50 sessions recorded
  2. The session history list shows all past sessions with filtering by project, provider, status, and date; clicking any past session opens its timeline, memory, and diffs as a read-only view
  3. The user can select any two sessions and open a side-by-side comparison showing provider, runtime, approval count, files changed, and final status
**Plans**: TBD

### Phase 9: Office Mode
**Goal**: Office mode shows every active agent as an animated pixel-art entity whose animation reflects its current state, with a hover card, click-through to Ops mode, and a draggable layout that persists locally — all rendering above 45fps with 10 concurrent sessions.
**Depends on**: Phase 8
**Requirements**: OFFICE-01, OFFICE-02, OFFICE-03, OFFICE-04
**Success Criteria** (what must be TRUE):
  1. Switching to Office mode shows each active agent as a distinct animated sprite whose animation state (planning, coding, reading, testing, waiting, blocked, completed, failed) changes within one second of a matching event arriving from the daemon
  2. Hovering over an agent shows its card with provider badge, task title, status, repo/branch, pending approvals count, last tool used, and elapsed time
  3. Clicking an agent in Office mode navigates to its Ops mode session detail panel
  4. The user can drag agents to rearrange their positions; the layout is persisted locally and survives a browser refresh
  5. With 10 concurrent active sessions each receiving events at 10 events/second, the Office mode canvas sustains at least 45fps (verified in browser DevTools)
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Daemon Core | 3/3 | Complete   | 2026-04-05 |
| 2. Claude Adapter + Approval Foundation | 3/3 | Complete   | 2026-04-05 |
| 3. Browser UI Shell + Session Management | 3/3 | Complete    | 2026-04-06 |
| 4. Codex Adapter | 3/3 | Complete   | 2026-04-06 |
| 5. Timeline & Replay | 3/3 | Complete   | 2026-04-06 |
| 6. Diff & Artifact Review | 0/? | Not started | - |
| 7. Memory Panel | 0/? | Not started | - |
| 8. Session History & Search | 0/? | Not started | - |
| 9. Office Mode | 0/? | Not started | - |
