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
- [ ] 10.2-00-PLAN.md — Catalog all backend features, events, and UI states (research)
- [ ] 10.2-01-PLAN.md — Test PixelLab MCP API: animation templates, costs, output format (research)
- [ ] 10.2-02-PLAN.md — Gather space pixel art references and style recommendations (research)
- [ ] 10.2-03-PLAN.md — Build 2000-image generation budget and ordered asset manifest (research)
- [ ] 10.2-04-PLAN.md — Design consultation: confirm character, palette, states, background (interactive)

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
