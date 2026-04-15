# Phase 14: Office Map View — Full Navigation Paradigm Shift - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning
**Source:** Inline description from user

<domain>
## Phase Boundary

Transform the entire Agent Cockpit navigation model. The Office map becomes the primary/default interface — a 2D spatial map where the user's character and active agent characters coexist. All session detail views (Approvals, Timeline, Diff, Memory, Artifacts, History) move out of standalone pages and into popup containers triggered by map interactions.

</domain>

<decisions>
## Implementation Decisions

### Navigation Model
- Office map IS the app — it is the landing/default view, not a secondary tab
- Top-level nav (Agent Cockpit | History | Office) is simplified or removed entirely
- History is no longer a primary nav destination — accessible as a global popup (map UI button or top bar)

### Map Characters
- User has their own controllable character on the map (static or minimal animation — no physics/movement engine)
- Each active agent session has its own character on the map
- Auto-layout for character positions (no persisted positions across restarts)

### Sidebar
- Retained but minimal: shows only active instance list with name + status badge
- No session metadata in the sidebar
- Clicking an instance in sidebar focuses/teleports camera to that instance's character on the map

### Popup Hub Per Instance
- Triggered by clicking an agent character on the map
- Contains all session detail as tabs: Approvals, Timeline, Diff, Memory, Artifacts
- This is the new "session detail view" — replaces the old per-session tab pages
- Popup tab content is functionally equivalent to the current tab pages (no internals redesign)

### History Global Popup
- History accessible as a global popup (e.g., map UI button or top bar element)
- Not a routed page/nav destination

### Approvals Regression Protection
- approve/deny/always-allow functionality must remain fully operational within the popup hub

### Claude's Discretion
- Specific popup framework (modal, drawer, floating panel)
- Camera focus animation (snap vs. smooth)
- Map tile/background visual style (reuse existing space station assets if available)
- Popup sizing and layout within constraints
- Exact top bar simplification approach
- Character sprite selection (use existing AgentSprite components)

</decisions>

<specifics>
## Specific Ideas

- Existing AgentSprite + AgentHoverCard components from Phase 9/10 can be reused/extended
- Existing OfficePage map canvas from Phase 9 is the foundation
- React Router routing should change so `/` or `/office` is the default route
- Sidebar currently exists — needs to be stripped to name+status only
- ApprovalsPanel, TimelinePanel, DiffPanel, MemoryPanel, ArtifactsPanel all exist — wrap in popup container
- HistoryPage content can be wrapped in a popup/modal

</specifics>

<deferred>
## Deferred Ideas

- Actual character movement animation or physics
- Persisted map positions across restarts (auto-layout is fine)
- Real-time multiplayer or collaboration features
- Redesign of popup content internals (Approvals, Timeline, etc. keep current logic/UI)

</deferred>

---

*Phase: 14-office-map-view-full-navigation-paradigm-shift*
*Context gathered: 2026-04-10 via inline user description*
