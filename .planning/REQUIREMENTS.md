# Requirements: Agent Mission Control

**Defined:** 2026-04-04
**Core Value:** One unified approval, memory, and replay layer across Claude Code and Codex — so developers can run agents productively, not just watch them.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Daemon Core

- [x] **DAEMON-01**: System has a normalized event schema with `schemaVersion` and `sequenceNumber` fields that all provider adapters emit to and all UI components consume from
- [x] **DAEMON-02**: System persists all session data, events, approvals, and memory in a local SQLite database with WAL mode enabled and checkpoint scheduling configured at boot
- [x] **DAEMON-03**: System provides a WebSocket server with sequence-based catch-up protocol so the browser can reconnect and replay missed events using `lastSeenSequence`
- [x] **DAEMON-04**: System includes a Claude adapter that ingests lifecycle hooks via an HTTP hook server, capturing session start/stop, tool calls, file changes, permission requests, subagent events, and memory read/write events
- [ ] **DAEMON-05**: System includes a Codex adapter that connects to `codex app-server` via stdio JSON-RPC, parsing item/turn events, handling approval requests in-band, and supporting session resume

### Session Management

- [x] **SESS-01**: User can see all active Claude Code and Codex sessions discovered automatically in one UI
- [ ] **SESS-02**: User can launch a new Claude or Codex session from the browser UI by selecting a repo and provider
- [x] **SESS-03**: User can attach to an already-running session and begin receiving its events
- [ ] **SESS-04**: User can filter the session list by project, provider, status, and recency

### Office Mode

- [ ] **OFFICE-01**: User can see each active agent as an animated visual entity whose animation reflects its current state (planning, coding, reading, testing, waiting, blocked, completed, failed)
- [ ] **OFFICE-02**: User can hover an agent to see its card showing: provider badge, task title, status, repo/branch, pending approvals count, last tool used, and elapsed time
- [ ] **OFFICE-03**: User can click an agent in Office mode to open its detailed Ops view
- [ ] **OFFICE-04**: User can drag agents to rearrange their positions and customize the office layout, with layout persisted locally

### Ops Mode

- [ ] **OPS-01**: User can see a session list panel in Ops mode showing all sessions with status indicators
- [ ] **OPS-02**: User can select a session and see its detail panel with task, provider, repo/branch, start time, and current status
- [ ] **OPS-03**: User can switch between sessions quickly without losing context or panel state
- [ ] **OPS-04**: User can navigate between Ops mode panels: approval inbox, timeline, diff viewer, memory, and artifacts/log

### Approvals

- [x] **APPR-01**: User can see all pending approvals from Claude and Codex in a single unified inbox
- [x] **APPR-02**: User can see each approval classified by type (shell command, network access, file change, sandbox escalation, MCP tool call, user-input elicitation) and risk level
- [x] **APPR-03**: User can approve once, deny once, or always-allow a similar action within the session for each pending approval
- [x] **APPR-04**: User can inspect an approval in detail (proposed action, reason, affected files/host, "why risky" hint, last related event) before deciding
- [x] **APPR-05**: System auto-denies any approval that has not received a decision within its timeout window, unblocking the agent with a deny response
- [x] **APPR-06**: All approval decisions (approve/deny/always-allow/timeout) are persisted locally and visible in session history

### Timeline & Replay

- [ ] **TIMELINE-01**: User can view a replayable ordered event timeline for each session showing: prompt/task created, plan updates, tool calls, command runs, file changes, approvals requested/resolved, subagent spawn/complete, memory read/write, completion/failure
- [ ] **TIMELINE-02**: User can scrub the timeline and jump directly to approval events or file-change events
- [ ] **TIMELINE-03**: User can filter the timeline by event type to focus on specific event categories
- [ ] **TIMELINE-04**: User can click a timeline event to inspect its related output, diff, or approval details

### Diff & Artifact Review

- [ ] **DIFF-01**: User can see a file tree of all files changed during a session
- [ ] **DIFF-02**: User can inspect a per-file raw diff view for any file changed in a session
- [ ] **DIFF-03**: User can see a session summary showing files touched, final status, and elapsed time

### Memory Panel

- [ ] **MEM-01**: User can view project memory for a workspace, showing persistent instructions, project conventions, build/test commands, architecture notes, and prior accepted agent learnings, normalized from provider-specific files (CLAUDE.md, auto memory) into one surface
- [ ] **MEM-02**: User can edit project memory directly in the UI, with changes written back to the provider-specific memory files
- [ ] **MEM-03**: User can create new memory notes and pin them to a project
- [ ] **MEM-04**: User can see agent-suggested memory updates and approve or reject them before they are written

### Session Comparison

- [ ] **COMP-01**: User can manually select two sessions and view them side-by-side in a read-only comparison showing: provider, runtime, approval count, files changed, and final status

### Notifications

- [x] **NOTIF-01**: User receives in-app notifications when a session needs approval, fails, or completes
- [x] **NOTIF-02**: User receives desktop/browser OS-level notifications for approval needed, session failed, and session completed events (when the browser tab is in the background)

### History & Search

- [ ] **HIST-01**: User can search across sessions, tasks/titles, memory items, file-change records, and approval history to answer questions like "what happened yesterday on repo X?" or "which session edited file Y?"
- [ ] **HIST-02**: User can browse a searchable, filterable session history list and reopen any past session to view its timeline, memory, and diffs

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Productivity

- **PROD-01**: User can label and tag sessions for organization
- **PROD-02**: User can view token, time, and cost counters per session

### Battle Mode

- **BATTLE-01**: User can send the same task to Claude and Codex simultaneously and compare results automatically (speed, approvals, files, quality)

### Approval Automation

- **AUTO-01**: User can define approval policy rules (auto-approve read-only commands, auto-deny outside repo root, always ask before network access)

### Git Integration

- **GIT-01**: User can create a branch or worktree per agent session for safer parallel work and comparison

### Team & Ecosystem

- **TEAM-01**: Multi-user viewing of the same local daemon session state (LAN sharing)
- **TEAM-02**: Shared team memory/workspace notes with authorship
- **NOTIF-03**: Slack/Discord notification channels
- **SDK-01**: Plugin SDK for adding new provider adapters

### Cosmetics

- **SKIN-01**: Skins, themes, furniture packs, avatar skins, sound packs for Office mode

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full cloud-hosted orchestration of remote agents | Local-first only in v1; requires infrastructure and security work beyond scope |
| Replacing Claude Code or Codex | This is a control layer, not a runtime |
| Enterprise features (SSO, RBAC, audit export, centralized policy) | Not the target user in v1 |
| Full multi-user collaboration / real-time presence | Deferred to post-MVP team features |
| Automatic prompt fan-out (battle mode) | v2 — manual comparison is sufficient for v1 |
| LAN/remote viewing | v2 — localhost-only in v1 for privacy and simplicity |
| Approval macro/policy rules | v2 — dangerous if misfired; requires UX research first |
| Branch-per-agent workflow automation | v2 — manual git workflow sufficient for v1 |
| Writing a new general-purpose agent runtime | Non-goal; control layer only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DAEMON-01 | Phase 1 | Complete |
| DAEMON-02 | Phase 1 | Complete |
| DAEMON-03 | Phase 1 | Complete |
| DAEMON-04 | Phase 2 | Complete |
| DAEMON-05 | Phase 4 | Pending |
| SESS-01 | Phase 3 | Complete |
| SESS-02 | Phase 3 | Pending |
| SESS-03 | Phase 3 | Complete |
| SESS-04 | Phase 3 | Pending |
| OFFICE-01 | Phase 9 | Pending |
| OFFICE-02 | Phase 9 | Pending |
| OFFICE-03 | Phase 9 | Pending |
| OFFICE-04 | Phase 9 | Pending |
| OPS-01 | Phase 3 | Pending |
| OPS-02 | Phase 3 | Pending |
| OPS-03 | Phase 3 | Pending |
| OPS-04 | Phase 3 | Pending |
| APPR-01 | Phase 2 | Complete |
| APPR-02 | Phase 2 | Complete |
| APPR-03 | Phase 2 | Complete |
| APPR-04 | Phase 2 | Complete |
| APPR-05 | Phase 2 | Complete |
| APPR-06 | Phase 2 | Complete |
| TIMELINE-01 | Phase 5 | Pending |
| TIMELINE-02 | Phase 5 | Pending |
| TIMELINE-03 | Phase 5 | Pending |
| TIMELINE-04 | Phase 5 | Pending |
| DIFF-01 | Phase 6 | Pending |
| DIFF-02 | Phase 6 | Pending |
| DIFF-03 | Phase 6 | Pending |
| MEM-01 | Phase 7 | Pending |
| MEM-02 | Phase 7 | Pending |
| MEM-03 | Phase 7 | Pending |
| MEM-04 | Phase 7 | Pending |
| COMP-01 | Phase 8 | Pending |
| NOTIF-01 | Phase 2 | Complete |
| NOTIF-02 | Phase 2 | Complete |
| HIST-01 | Phase 8 | Pending |
| HIST-02 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 39 total
- Mapped to phases: 39
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-04*
*Last updated: 2026-04-04 after roadmap creation — traceability complete*
