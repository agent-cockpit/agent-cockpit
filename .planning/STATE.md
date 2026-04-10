---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 14-04-PLAN.md — OfficePage as default route, History as popup
last_updated: "2026-04-10T16:34:01.747Z"
last_activity: 2026-04-10 — InstancePopupHub and MapSidebar built, all components use store-selected sessionId
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 19
  completed_plans: 17
  percent: 81
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** One unified approval, memory, and replay layer across Claude Code and Codex — so developers can run agents productively, not just watch them.
**Current focus:** Phase 4 — Codex Adapter

## Current Position

Phase: 14 of 14 in progress (Office Map View — Full Navigation Paradigm Shift)
Plan: 14-03 complete, 14-04 next
Status: Phase 14 in progress — components ready for router integration
Last activity: 2026-04-10 — InstancePopupHub and MapSidebar built, all components use store-selected sessionId

Progress: [█████████░] 81%

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 2 min
- Total execution time: 0.03 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-daemon-core | 1 | 2 min | 2 min |

**Recent Trend:**
- Last 5 plans: 2 min
- Trend: —

*Updated after each plan completion*
| Phase 01-daemon-core P02 | 5min | 3 tasks | 11 files |
| Phase 01-daemon-core P03 | 2min | 2 tasks | 6 files |
| Phase 02-claude-adapter-approval-foundation P01 | 8 | 2 tasks | 5 files |
| Phase 02-claude-adapter-approval-foundation P02 | 2 | 2 tasks | 4 files |
| Phase 02-claude-adapter-approval-foundation P03 | 8 | 2 tasks | 3 files |
| Phase 02-claude-adapter-approval-foundation P03 | 8 | 3 tasks | 3 files |
| Phase 03-browser-ui-shell-session-management P01 | 7 | 2 tasks | 21 files |
| Phase 03-browser-ui-shell-session-management P02 | 7min | 2 tasks | 7 files |
| Phase 03-browser-ui-shell-session-management P03 | 9 | 2 tasks | 9 files |
| Phase 04-codex-adapter P01 | 4 | 2 tasks | 3 files |
| Phase 04-codex-adapter P02 | 5 | 2 tasks | 3 files |
| Phase 04-codex-adapter P03 | 15 | 2 tasks | 4 files |
| Phase 05-timeline-replay P02 | 2 | 2 tasks | 3 files |
| Phase 05-timeline-replay P01 | 2min | 2 tasks | 4 files |
| Phase 05-timeline-replay P03 | 3 | 1 tasks | 2 files |
| Phase 06-diff-artifact-review P01 | 8 | 2 tasks | 2 files |
| Phase 07-memory-panel P01 | 2min | 2 tasks | 6 files |
| Phase 07-memory-panel P02 | 5min | 2 tasks | 4 files |
| Phase 07-memory-panel P03 | 3min | 2 tasks | 2 files |
| Phase 08-session-history-search P01 | 2 | 2 tasks | 4 files |
| Phase 08-session-history-search P02 | 2 | 2 tasks | 5 files |
| Phase 08-session-history-search P03 | 4 | 2 tasks | 9 files |
| Phase 09-office-mode P01 | 2 | 3 tasks | 7 files |
| Phase 09-office-mode P02 | 1 | 2 tasks | 4 files |
| Phase 09-office-mode P03 | 1min | 2 tasks | 4 files |
| Phase 09-office-mode P04 | 3min | 2 tasks | 4 files |
| Phase 10-approval-inbox-ui P01 | 2min | 2 tasks | 4 files |
| Phase 10-approval-inbox-ui P02 | 2min | 2 tasks | 2 files |
| Phase 10.1-session-tracking-bug-fix P01 | 8 | 3 tasks | 3 files |
| Phase 10.1-session-tracking-bug-fix P02 | 5 | 2 tasks | 3 files |
| Phase 10.2-pixel-art-preproduction P00 | 2min | 4 tasks | 1 files |
| Phase 10.2-pixel-art-preproduction P02 | 4 | 4 tasks | 1 files |
| Phase 10.2-pixel-art-preproduction P01 | 8min | 4 tasks | 1 files |
| Phase 10.2-pixel-art-preproduction P03 | 3 | 4 tasks | 1 files |
| Phase 14 P01 | 177 | 2 tasks | 4 files |
| Phase 14 P02 | 4min | 2 tasks | 4 files |
| Phase 14 P03 | 9min | 3 tasks | 5 files |
| Phase 14 P04 | 529 | 2 tasks | 6 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Daemon-first order is dictated by the feature dependency tree — every UI feature requires the local daemon
- Roadmap: Approval timeout logic ships in Phase 2 with the first approval implementation, not as a follow-up
- Roadmap: Office mode is Phase 9 (last) — additive display layer on proven Zustand store, no data model dependencies
- Roadmap: Codex adapter is Phase 4 (after browser UI shell) — isolated adapter boundary avoids contaminating core architecture validation
- 01-01: Package exports point to ./src/index.ts — no build step required in workspace development
- 01-01: NodeNext moduleResolution used throughout — requires .js extensions in TypeScript source imports
- 01-01: sequenceNumber is optional on NormalizedEvent — adapters omit it, SQLite assigns on insert
- 01-01: vitest.config.ts uses 'projects' field (not deprecated vitest.workspace.ts) per Vitest 3.2+ convention
- [Phase 01-02]: WAL mode assertion skipped for :memory: databases — SQLite in-memory always uses 'memory' journal mode; WAL test uses os.tmpdir() temp file
- [Phase 01-02]: INTEGER PRIMARY KEY without AUTOINCREMENT — rowid recycles after deletion; acceptable for append-only event log
- [Phase 01-02]: pnpm onlyBuiltDependencies in pnpm-workspace.yaml is the correct way to allow native addon builds in pnpm v10
- [Phase 01-daemon-core]: getEventsSince selects sequence_number column and merges into parsed payload — payload JSON stored at insert time does not include sequenceNumber
- [Phase 01-daemon-core]: Synchronous catch-up replay before live event subscription — better-sqlite3 sync + Node single-threaded ensures atomic replay with no ordering violations
- [Phase 02-claude-adapter-approval-foundation]: Session ID cache is module-level Map — ensures same Claude session_id maps to same UUID within process lifetime
- [Phase 02-claude-adapter-approval-foundation]: Claim-then-act for resolveApproval: delete from pendingApprovals before res.end() to prevent double-write race condition
- [Phase 02-claude-adapter-approval-foundation]: res.resume() required in Node.js HTTP test clients — IncomingMessage starts in paused mode; without it, end event never fires
- [Phase 02-claude-adapter-approval-foundation]: pendingSet claim-then-act prevents double-resolution: delete approvalId before I/O to guard concurrent timeout + decide
- [Phase 02-claude-adapter-approval-foundation]: pendingEvents Map stores full NormalizedEvent per approvalId to avoid extra DB read when constructing always_allow rules
- [Phase 02-claude-adapter-approval-foundation]: approvalStore is pure data layer with no business logic; all orchestration lives in ApprovalQueue
- [Phase 02-claude-adapter-approval-foundation]: Hook server started before WS server — both depend on DB but hook server has no WS dependency
- [Phase 02-claude-adapter-approval-foundation]: hookServer.close() before WAL checkpoint in shutdown to stop incoming hooks before DB closes
- [Phase 02-claude-adapter-approval-foundation]: Notification helpers receive visibilityState as param (not document.visibilityState) — Node-testable, no DOM globals
- [Phase 03-browser-ui-shell-session-management]: packages/ui tsconfig uses module=ESNext + moduleResolution=Bundler (not NodeNext) — Vite is the bundler, no .js extension required in TS source
- [Phase 03-browser-ui-shell-session-management]: React Router v7 lazy route functions destructure named exports and return { Component } — avoids type mismatch with LazyRouteFunction signature
- [Phase 03-browser-ui-shell-session-management]: connectDaemon reads useStore.getState() at call time (not module init) — ensures lastSeenSequence is current on reconnect for SESS-03 catch-up
- [Phase 03-browser-ui-shell-session-management]: Zustand array selectors require shallowArrayEqual equality function — filter/sort always returns new array, causing infinite re-render without equality check
- [Phase 03-browser-ui-shell-session-management]: POST /api/sessions request handler registered before upgrade handler on httpServer — HTTP request and WebSocket upgrade are mutually exclusive Node events
- [Phase 03-browser-ui-shell-session-management]: LaunchSessionModal uses plain div overlay (no shadcn) — shadcn is installed in Plan 03, keeping plans decoupled
- [Phase 03-browser-ui-shell-session-management]: useFilteredSessions uses useRef to cache array reference — React 18 useSyncExternalStore strict-mode double-invocation requires stable snapshot reference; shallowArrayEqual alone insufficient
- [Phase 03-browser-ui-shell-session-management]: OpsLayout tests mock SessionListPanel; SessionListPanel tests mock useNavigate — two-file split avoids React-18/Zustand infinite loop in component tests
- [Phase 04-codex-adapter]: codex_sessions uses session_id (UUID) as PK and thread_id (Codex thr_xxx) as separate column — maps Codex thread identity to our session namespace
- [Phase 04-codex-adapter]: Wave 0 stub pattern: it.todo() stubs with void import references compile cleanly; vitest fails RED at collection time (Cannot find module) without placeholder implementations
- [Phase 04-codex-adapter]: _codexServerId attached directly on NormalizedEvent with _ prefix (non-schema side-channel) — Plan 03 adapter reads it to correlate Codex approval reply IDs
- [Phase 04-codex-adapter]: classifyCodexApproval uses Set of HIGH_RISK_COMMANDS tokens checked per-token (not regex) — O(1) lookup, covers rm/sudo/chmod/chown/kill/pkill/curl/wget
- [Phase 04-codex-adapter]: CodexParserContext mutated by parseCodexLine (sessionStartEmitted flag) — caller owns context lifetime; mutation intentional for dedup
- [Phase 04-codex-adapter]: procFactory parameter injected into CodexAdapter constructor — tests provide EventEmitter mock, production spawns real codex binary
- [Phase 04-codex-adapter]: resolveCodexApproval is a no-op guard so both resolvers called unconditionally in approvalQueue.decide/handleTimeout
- [Phase 05-timeline-replay]: EMPTY_EVENTS exported from eventsSlice (not inline []) ensures stable selector reference, preventing infinite re-render loops in TimelinePanel
- [Phase 05-timeline-replay]: bulkApplyEvents replaces entire array for sessionId — designed for REST hydration providing canonical ordered set without dedup overhead
- [Phase 05-01]: getEventsBySession returns 200 + empty array for unknown sessionId (not 404) — consistent with REST collection semantics
- [Phase 05-01]: eventsMatch regex placed before POST handler in ws/server.ts to avoid URL collision and support future sub-routes
- [Phase 05-03]: data-testid='timeline-list' added to list container — RTL within() scoping required because filter chips use same text as event row labels
- [Phase 05-03]: ToolCallEvent uses 'input' field (not 'toolInput') matching actual shared schema — InlineDetail renders event.input via JSON.stringify
- [Phase 06-diff-artifact-review]: DiffPanel derives file tree from events array at render time (not stored in Zustand) — avoids synchronization complexity
- [Phase 06-diff-artifact-review]: data-testid='diff-line-add' and 'diff-line-del' used for colorization assertions — more reliable than className checks in RTL
- [Phase 07-01]: memory_notes table placed after codex_sessions in schema block — preserves append-only ordering and matches research spec
- [Phase 07-01]: readFileSafe uses bare catch (not ENOENT check) — covers ENOENT and EACCES both returning null per behavior spec
- [Phase 07-01]: MemoryPanel.test.tsx uses it.todo() only — stub component already exists at panels/MemoryPanel.tsx
- [Phase 07-02]: broadcast() receives optional db param to enable suggestion side-effect Map population without breaking existing call sites
- [Phase 07-02]: pendingSuggestions Map at module scope in server.ts — survives across requests, cleared by approve/reject delete
- [Phase 07-memory-panel]: dismissedIds Set used for optimistic card removal after approve/reject without waiting for store update
- [Phase 07-memory-panel]: claudeMdLoaded flag prevents flash of No CLAUDE.md found empty state before fetch resolves
- [Phase 07-memory-panel]: Suggestion ID derived from event.id ?? event.memoryKey ?? event.timestamp — MemoryWriteEvent lacks explicit id field
- [Phase 08-session-history-search]: FTS5 external content table (content='') with manual INSERT — avoids full-table scan, idempotent backfill via INSERT OR IGNORE on openDatabase()
- [Phase 08-session-history-search]: searchAll wraps user query in double-quotes + escapes internal double-quotes to prevent FTS5 syntax injection
- [Phase 08-session-history-search]: persistEvent extracts specific text fields for FTS5 indexing rather than full JSON blob — keeps index focused and results relevant
- [Phase 08-session-history-search]: SessionSummary defined locally in UI store to avoid cross-package daemon import
- [Phase 08-session-history-search]: GET /api/sessions/:id/summary registered before GET /api/sessions to prevent URL collision
- [Phase 08-session-history-search]: HistoryPage uniqueProjects memoized on sessions.length to avoid over-computation while still catching new sessions
- [Phase 08-session-history-search]: MemoryPanel read view for CLAUDE.md in historyMode uses pre block to preserve content readability without edit capability
- [Phase 09-office-mode]: @radix-ui/react-hover-card installed in Plan 01 alongside dnd-kit to front-load all Office Mode dependencies
- [Phase 09-office-mode]: tool_call subcases use regex test on lowercased toolName (read|view|grep|search → reading, write|edit|create|apply → coding, test|run|exec|bash → testing)
- [Phase 09-office-mode]: useLocalStorage lazy initializer wraps localStorage.getItem in try/catch to handle both SSR and QuotaExceededError
- [Phase 09-office-mode]: AgentHoverCard receives elapsedMs as prop — prevents Date.now() flakiness in tests and gives OfficePage full control over refresh cadence
- [Phase 09-office-mode]: task title uses workspacePath basename — will improve when SessionRecord gains a title field
- [Phase 09-office-mode]: vi.hoisted() required when mock factory closures reference variables declared in test file scope — avoids hoisting temporal dead zone errors
- [Phase 09-office-mode]: useStore.getState() mock attached via Object.assign on the mock function — matches Zustand static method pattern
- [Phase 09-office-mode]: PointerSensor with activationConstraint.distance=8 replaces dnd-kit default sensors to allow click events through without triggering drag
- [Phase 09-office-mode]: activeDragId stored as separate useState to prevent positions state read during drag causing infinite re-render loop
- [Phase 09-office-mode]: Radix HoverCard.Content must be mocked in tests to render children synchronously — portal-based conditional rendering prevents AgentHoverCard from mounting
- [Phase 10-approval-inbox-ui]: approvalsSlice uses Pick<ApprovalsSlice> instead of Pick<AppStore> to avoid circular import — AppStore extends ApprovalsSlice so callers are type-compatible
- [Phase 10-approval-inbox-ui]: vi.mock + top-level await import pattern used for sendWsMessage — allows mock to be cleared per-test while preserving module graph for RTL
- [Phase 10-approval-inbox-ui]: Buttons use aria-label for RTL role+name queries — ensures accessible names are unambiguous even with icon-only future variants
- [Phase 10.1-session-tracking-bug-fix]: claude_id must be UNIQUE NOT NULL (not just NOT NULL) so INSERT OR IGNORE fires on duplicate claude_id
- [Phase 10.1-session-tracking-bug-fix]: INSERT OR IGNORE enforces first-write-wins semantics for claude_id mapping — same claude_id always maps to same UUID
- [Phase 10.1-session-tracking-bug-fix]: setClaudeSessionDb() added alongside setClaudeSessionCache() — tests inject db via module-level setter rather than per-call parameter, keeping parseHookPayload signature unchanged
- [Phase 10.1-session-tracking-bug-fix]: SubagentStart and SubagentStop pass payload.cwd as workspace to claude_sessions — consistent with SessionStart workspace tracking
- [Phase 10.2-00]: Sprite sheet spec: 32x32px per frame, 8 states — matches existing AgentSprite render spec
- [Phase 10.2-00]: Priority 1 pixel art asset is the agent sprite sheet — Office Mode is inoperable without it
- [Phase 10.2-pixel-art-preproduction]: Option A Deep Space Terminal palette recommended — dark void background with phosphor green primary and per-state accent colors
- [Phase 10.2-pixel-art-preproduction]: Three-layer state signal: CSS glow color (primary), floating 8x8 icon above head (secondary), body pose silhouette (tertiary)
- [Phase 10.2-pixel-art-preproduction]: PixelLab anchor-prompt approach: generate base character first, then state delta prompts for consistency across 8 sprite states
- [Phase 10.2-pixel-art-preproduction]: PixelLab standard mode costs 1 generation flat regardless of direction count or quality settings; template animations cost 1 gen/direction vs 20-40 for custom
- [Phase 10.2-pixel-art-preproduction]: South-only animation strategy: generate animations for south direction only reduces 8-state sprite cost from 32 gens to 8 gens; chibi proportions required at 32px for glowing visor readability
- [Phase 10.2-pixel-art-preproduction]: PixelLab sprite sheet must be assembled manually — API returns individual frame PNGs not a sprite sheet; post-processing step required in generation pipeline
- [Phase 10.2-pixel-art-preproduction]: South-only animation strategy: 8 gens for all 8 AgentAnimStates vs 32 (4-dir) — current AgentSprite renders single-direction only; reserve directional capability by creating with n_directions:4 but animating south only
- [Phase 10.2-pixel-art-preproduction]: 64-item generation manifest uses only 63 of 2000 images; budget risk is near-zero; tier allocation caps are organizational discipline not budget protection
- [Phase 10.2-pixel-art-preproduction]: Prototype-first ordering: lock anchor character_id from 1-3 prototype attempts before queueing any animation jobs; prevents wasting animation budget on rejected character design
- [Phase 14]: Keep /session/:sessionId routes for HistoryPage deep links (historyMode compatibility)
- [Phase 14]: OfficePage sprite click triggers popup state, not router navigation
- [Phase 14]: History accessible via modal popup, not separate route
- [Phase 14]: OpsLayout sidebar shows MapSidebar (active sessions only)

### Roadmap Evolution

- Phase 14 added: Office Map View — Full Navigation Paradigm Shift

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 4 planning: Codex app-server initialization handshake sequence may have changed in recent CLI versions — capture fixture files at planning time
- Phase 7 planning: CLAUDE.md auto-memory format and agent-suggested memory hook event names need confirmation before planning

## Session Continuity

Last session: 2026-04-10T16:34:01.744Z
Stopped at: Completed 14-04-PLAN.md — OfficePage as default route, History as popup
Resume file: None
