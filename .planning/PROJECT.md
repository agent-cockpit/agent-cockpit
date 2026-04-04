# Agent Mission Control

## What This Is

Agent Mission Control is a local, browser-based control room for coding agents — starting with Claude Code and Codex. It combines a pixel-art spatial visualization layer (Office mode) with a serious operational control plane (Ops mode) for approvals, memory, replay, diffs, and session orchestration. It is aimed at individual developers who run multiple agent sessions and want unified visibility and control, without switching between terminals and tools.

## Core Value

One unified approval, memory, and replay layer across Claude Code and Codex — so developers can run agents productively, not just watch them.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Session Management**
- [ ] Discover and display all active Claude Code and Codex sessions
- [ ] Launch or attach to sessions from the browser UI
- [ ] Track session lifecycle (start, progress, completion, failure)
- [ ] Persist session metadata locally (survives browser refresh and app restart)
- [ ] Filter sessions by project, provider, status, and recency

**Office Mode**
- [ ] Show each active agent as a distinct animated visual entity
- [ ] Update agent state/animation from normalized session events
- [ ] Agent card/popover shows: provider, task, status, repo/branch, pending approvals, last tool used, elapsed time
- [ ] Click agent to open detailed Ops view

**Ops Mode**
- [ ] Session list panel
- [ ] Selected session detail panel
- [ ] Timeline/replay panel per session
- [ ] File/diff panel per session
- [ ] Memory panel per project
- [ ] Artifacts/log panel
- [ ] Fast switching between sessions without losing context

**Approval Inbox**
- [ ] Aggregate pending approvals from all providers into one queue
- [ ] Classify approvals by type (shell, network, file change, sandbox, MCP tool, user input)
- [ ] Show risk level, proposed action, affected files, and "why risky" hint per approval
- [ ] Support: approve once, deny once, always allow within session
- [ ] Persist all approval decisions locally

**Timeline & Replay**
- [ ] Replayable event timeline per session (prompts, plans, tool calls, commands, file changes, approvals, subagents, memory events, completion)
- [ ] Scrub timeline, jump to approval/file-change events, filter by event type

**Diff & Artifact Review**
- [ ] File tree of changed files per session
- [ ] Raw diff view per file
- [ ] Session summary: files touched, final status

**Memory Panel**
- [ ] View and edit project memory (CLAUDE.md, auto memory, project conventions)
- [ ] Create new memory notes; approve agent-suggested memory updates
- [ ] Pin memory to project; distinguish shared vs local-only notes
- [ ] Normalize provider-specific memory into one editable surface

**Session Comparison**
- [ ] Side-by-side read-only comparison of two sessions
- [ ] Compare: provider, runtime, approvals, files changed, final status

**Notifications**
- [ ] In-app and desktop/browser notifications for: approval needed, session failed, session completed, subagent returned, provider disconnected

**Search & History**
- [ ] Search across sessions, tasks, memory, file-change records, approval history
- [ ] Searchable session history with filtering

**Local Daemon**
- [ ] Local daemon for provider integration, event normalization, WebSocket updates, and SQLite persistence
- [ ] Unified event model normalizing Claude and Codex events into a common schema
- [ ] Claude adapter: hook ingestion, subagent lifecycle, memory reading, permission/approval signal ingestion
- [ ] Codex adapter: JSONL event stream parsing, approval event handling, app-server integration, session resume

### Out of Scope

- Full cloud-hosted orchestration of remote agents — local-first only in v1
- Replacing Claude Code or Codex — this is a control layer, not a runtime
- Enterprise features (SSO, RBAC, audit export) — out of v1 scope
- Full multi-user collaboration — deferred to post-MVP
- Battle mode (automatic prompt fan-out) — post-MVP
- Approval macros/policy rules — post-MVP
- Branch-per-agent workflows — post-MVP
- LAN/remote viewing — post-MVP
- Skins/themes marketplace — cosmetics don't block MVP

## Context

- **Inspiration**: Pixel Agents (VS Code extension) proves agent visualization is compelling but is VS Code-bound, Claude-specific, and partly heuristic. This product evolves that concept into a browser-first, provider-agnostic control room.
- **Integration surfaces**: Claude Code exposes lifecycle hooks with structured JSON, persistent memory (CLAUDE.md, auto memory), and subagent support. Codex exposes JSONL event streams, resumable sessions, configurable approval policy, and an app-server for rich clients.
- **Target users**: Primary — solo developer running multiple Claude/Codex sessions wanting unified visibility. Secondary — small technical team. Tertiary — creator/OSS dev who values demoability.
- **Existing codebase**: This repo (`agent-cockpit`) is a greenfield implementation.

## Constraints

- **Architecture**: Local daemon + browser UI — no cloud backend required for core functionality
- **Privacy**: All session data stored locally by default; browser UI binds to localhost; remote access is opt-in only
- **Security**: Secrets redacted in command previews; sensitive paths/env vars redacted where feasible; destructive actions require explicit user approval
- **Stack**: React frontend (Vite), Canvas/Pixi for Office mode, Monaco/diff component for file review; TypeScript daemon with WebSocket server, SQLite persistence
- **Performance**: UI must stay responsive with at least 10 concurrent visible sessions

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Browser-first, local daemon architecture | Overcomes VS Code extension limitations; supports cross-editor usage; Codex app-server designed for this pattern | — Pending |
| Claude adapter uses hooks (not transcript observation) | Transcript heuristics misfire; hooks give structured, reliable lifecycle events | — Pending |
| Codex adapter: app-server + JSONL exec path | App-server provides approvals + streaming; JSONL exec is fallback | — Pending |
| SQLite for v1 persistence | Sufficient for local-first use; enables replay, search, crash recovery | — Pending |
| Office mode is a mode, not the only mode | Prevents "too gimmicky" failure mode; Ops mode is the reason to stay | — Pending |
| Human approvals are central, not optional | Safety-first; keeps execution controls from becoming unsafe | — Pending |

---
*Last updated: 2026-04-04 after initialization from PRD*
