- [ ] 10-02-PLAN.md — ApprovalInbox full implementation with RTL tests (APPR-01, APPR-02, APPR-03, APPR-04)

### Phase 10.1: Session Tracking Bug Fix
**Goal**: All Claude Code sessions have a `session_start` event even after daemon restarts, ensuring sessions appear correctly in the UI's session list.
**Depends on**: Phase 10
**Requirements**: SESS-01
**Bug Summary**: The `sessionIdCache` in `hookParser.ts` is stored in-memory and lost on daemon restart. When the daemon restarts, existing Claude sessions continue emitting events, but the cache is empty, causing:
1. New UUIDs are generated for existing Claude sessions
2. No `session_start` event is emitted for these sessions (only tool_call, approval_request, etc.)
3. The UI's `sessionsSlice` never creates session records (only creates on `session_start`)
4. Sessions are invisible in the UI despite having events in the database
**Success Criteria** (what must be TRUE):
  1. After daemon restart, events from an existing Claude session are correctly associated with its original session ID
  2. Every visible session in the UI has exactly one `session_start` event in the database
  3. The Claude session ID to Cockpit session ID mapping persists across daemon restarts
  4. No duplicate session records are created for the same Claude session
**Plans**: 3 plans

Plans:
- [ ] 10.1-00-PLAN.md — Create failing test stubs for session mapping persistence (SESS-01)
- [ ] 10.1-01-PLAN.md — Create claude_sessions table, cache initialization, and query functions (SESS-01)
- [ ] 10.1-02-PLAN.md — Refactor hookParser with DB-backed cache and wire daemon startup (SESS-01)

### Phase 10.2: Pixel Art Pre-Production
**Goal**: Research and plan the pixel art visual redesign before spending any generation budget — catalog backend features, learn the PixelLab API, gather space theme references, plan the 2000-image budget, and lock design decisions with the user.
**Depends on**: Phase 10.1
**Theme**: Space
**Success Criteria** (what must be TRUE):
  1. Every backend feature and UI state the art must represent is documented
  2. PixelLab animation costs and capabilities are understood from hands-on testing
  3. Space-themed visual references are gathered with concrete style recommendations
  4. A generation manifest exists that fits within the 2000-image budget
  5. The user has confirmed a locked design brief (character type, palette, state styles, background)
**Plans**: 5 plans

Plans:
- [x] 10.2-00-PLAN.md — Catalog all backend features, events, and UI states (research)
- [x] 10.2-01-PLAN.md — Test PixelLab MCP API: animation templates, costs, output format (research)
- [x] 10.2-02-PLAN.md — Gather space pixel art references and style recommendations (research)
- [x] 10.2-03-PLAN.md — Build 2000-image generation budget and ordered asset manifest (research)
- [x] 10.2-04-PLAN.md — Design consultation: confirm character, palette, states, background (interactive)

### Phase 11: Notifications UI
**Goal**: In-app notifications (toast/badge) fire when an approval is needed or a session ends, and OS-level `new Notification()` fires when the browser tab is in the background — wired through `useSessionEvents.ts` onmessage handler.
**Depends on**: Phase 10
**Requirements**: NOTIF-01, NOTIF-02
**Gap Closure**: Closes gaps from v1.0 audit — notificationHelpers in wrong package, no Notification() calls
**Success Criteria** (what must be TRUE):
  1. An in-app toast or badge fires within one second of an `approval_request` or `session_end` event arriving over WebSocket
  2. A browser `new Notification()` fires for `approval_request`, `session_failed`, and `session_completed` events when the tab is not focused
  3. Notification helpers are importable by the browser (in `packages/ui` or `packages/shared`)
**Plans**: 2 plans

Plans:
- [ ] 10-01-PLAN.md — approvalsSlice + sendWsMessage export + store wiring (APPR-01, APPR-03, APPR-04)
- [ ] 10-02-PLAN.md — ApprovalInbox full implementation with RTL tests (APPR-01, APPR-02, APPR-03, APPR-04)

### Phase 12: Search and Session Fixes
**Goal**: Fix known search and session display issues identified in v1.0 audit.
**Depends on**: Phase 11
**Plans**: TBD

### Phase 13: Pixel Art Generation and Integration
**Goal**: Generate all 10 character sprite sheets using PixelLab MCP, build the sprite sheet assembly pipeline, and integrate into the Office Mode UI — replacing the placeholder `agent-sheet.png` reference with a full multi-character, 64px, 8-direction animated system.
**Depends on**: Phase 10.2
**Design Brief**: `.planning/phases/10.2-pixel-art-preproduction/10.2-04-DESIGN-DECISIONS.md`
**Budget**: 2000 images available (~562 planned)
**Success Criteria** (what must be TRUE):
  1. All 10 character types generated with base sprite + idle + blocked/completed/failed animations, 8 directions, 64px
  2. `public/sprites/{character}-sheet.png` exists for all 10 characters
  3. `AgentSprite.tsx` assigns character by sessionId hash, renders at 64px, supports 8 directions
  4. CSS state classes apply correct glow color for color-states and correct animation row for unique-animation states
  5. Office Mode background renders the space station grid floor tileset
  6. All Tier 2/3 assets (icons, badges, loading animation) generated and wired
**Plans**: 5 plans

Plans:
- [ ] 13-00-PLAN.md — Generate Astronaut end-to-end and build sprite sheet pipeline (validate before bulk)
- [ ] 13-01-PLAN.md — Generate remaining 9 characters (bulk generation)
- [ ] 13-02-PLAN.md — AgentSprite.tsx multi-character support + sessionId→character mapping
- [ ] 13-03-PLAN.md — CSS state system (glow colors + unique animation rows) + Office background tiles
- [ ] 13-04-PLAN.md — Tier 2/3 assets: icons, risk badges, loading animation

### Phase 14: Office Map View — Full Navigation Paradigm Shift

**Goal:** Transform the entire Agent Cockpit navigation model. Office map IS the app — default landing view. Agent characters on map. Clicking agent character opens popup hub with all session detail tabs. Sidebar minimal (name+status only). History becomes global popup. No approvals regressions.
**Requirements**: routing-default, panel-sessionid-fallback, popup-hub, sidebar-minimal, sidebar-focus, history-popup, nav-simplified, user-character, approvals-regression
**Depends on:** Phase 13
**Plans:** 5/5 plans complete

Plans:
- [ ] 14-01-PLAN.md — Install @radix-ui/react-dialog + @radix-ui/react-tabs, create Wave 0 test stubs
- [ ] 14-02-PLAN.md — Panel useParams → Zustand selectedSessionId fallback (ApprovalInbox, Timeline, Diff, Memory)
- [ ] 14-03-PLAN.md — Build InstancePopupHub (Radix Dialog + Tabs) and MapSidebar (slim active session list)
- [ ] 14-04-PLAN.md — Router switch (OfficePage as index), sprite-click → popup, OpsLayout nav simplification, HistoryPopup
- [ ] 14-05-PLAN.md — User character on map, sidebar camera focus wiring, human-verify checkpoint
