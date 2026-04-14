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

---

## v1.1 — 2D Pixel Art Game Experience

### Phase 15: Game Engine Foundation
**Goal:** A stable 60 FPS game loop runs on the Office map page, with a GameState store (separate from React state), a Canvas rendering layer mounted behind the existing React UI, and a camera system that smoothly follows a target position with lerp and world-edge clamping.
**Depends on:** Phase 14
**Requirements:** game-loop, gamestate-store, camera-system
**Success Criteria** (what must be TRUE):
  1. `requestAnimationFrame` loop maintains 60 FPS; delta time is passed to all update functions
  2. `GameState` object is updated every frame without triggering React re-renders
  3. Canvas element is mounted and sized to match the viewport, sitting below the React overlay
  4. Camera lerps toward its target position and stops at world bounds
  5. Existing React UI (sidebar, popups, top bar) renders correctly on top of the Canvas layer
**Plans:** 3/3 plans complete

Plans:
- [ ] 15-01-PLAN.md — GameEngine class (rAF loop, delta time, pause/resume) + GameState types
- [ ] 15-02-PLAN.md — Canvas mount in OfficePage + Camera system (lerp, bounds, follow)
- [ ] 15-03-PLAN.md — Wire existing sprite rendering into Canvas (replace CSS-positioned sprites)

### Phase 16: Player Controls
**Goal:** The user's character on the map responds to WASD/arrow key input with smooth pixel-based movement, and clicking an agent character teleports the camera focus to that agent instantly.
**Depends on:** Phase 15
**Requirements:** player-movement, click-to-teleport, input-tracking
**Success Criteria** (what must be TRUE):
  1. WASD and arrow keys move the player character at a consistent speed (frame-rate independent)
  2. Player character faces the direction of movement (8-directional sprite selection)
  3. Player cannot walk outside world bounds
  4. Clicking an agent on the map instantly moves the camera to center on that agent
  5. Keyboard input does not conflict with text inputs or popup interactions
**Plans:** 2/2 plans complete

Plans:
- [ ] 16-01-PLAN.md — Input system (keyboard state tracking, WASD movement, bounds clamping)
- [ ] 16-02-PLAN.md — Click-to-teleport camera focus + direction-aware sprite selection on move

### Phase 16.1: Map Rendering & Camera Zoom (INSERTED)

**Goal:** Replace the hardcoded CSS tiled floor and 1920x1440 world bounds with the real Cockpit Map-export tilemap (101x101 tiles at 32px = 3232x3232px world). Render terrain via Wang tilesets, composite the overlay PNG, place 30 objects from manifest.json, and apply fixed 2x camera zoom with player-centered following and map-bounds clamping.
**Requirements**: MAP-RENDER
**Depends on:** Phase 16
**Plans:** 3/3 plans complete

Plans:
- [ ] 16.1-01-PLAN.md — Copy map assets to public, update world bounds/player start, add zoom to CameraState, create Wave 0 test stubs
- [ ] 16.1-02-PLAN.md — Implement TilemapRenderer.ts (OffscreenCanvas pre-render, Wang tiles, overlay, objects)
- [ ] 16.1-03-PLAN.md — Wire TilemapRenderer into OfficePage: zoom transform, camera fix, click hit-test fix, human verify

### Phase 16.2: Walking Animation & Sprite Quality (INSERTED)

**Goal:** Animate the player character and NPC agents on the map. When the player holds WASD, the sprite plays its walk cycle; when released, it snaps to the rest frame. NPC agents cycle through their state animations (idle, blocked, completed, failed) continuously.
**Depends on:** Phase 16.1
**Plans:** 3/3 plans complete

Plans:
- [ ] 16.2-01-PLAN.md — Add animTime to GameState.player + advance/reset in movePlayer() + new tests
- [ ] 16.2-02-PLAN.md — Wire player render col from animTime in OfficePage.tsx + human verify
- [ ] 16.2-03-PLAN.md — Add tick to DrawAgentSpriteOptions, NPC tick-based col, update call site + AgentSprite.test.ts

### Phase 16.3: Collision System (INSERTED)

**Goal:** The player cannot walk through walls, furniture, or map boundaries. Solid tiles (walls, desks, pillars) block movement; only open-floor tiles allow passage. Collision is resolved before the position is committed to GameState.
**Depends on:** Phase 16.2
**Plans:** 1 plan

Plans:
- [ ] 16.3-PLAN.md — Define solid-tile mask, per-tile walkability lookup, pre-commit collision resolution in movePlayer()

### Phase 16.4: Astronaut Walking Sprite Generation (INSERTED)

**Goal:** Generate a high-quality astronaut character sprite sheet with a proper 8-direction walk cycle using the PixelLab API. The resulting sprite sheet replaces the current placeholder/bad animation frames, providing smooth, pixel-art walking animation for all 4 cardinal directions (or 8 if feasible).
**Depends on:** Phase 16.3
**Plans:** 2/2 plans complete

Plans:
- [ ] 16.4-01-PLAN.md — Generate astronaut walk cycle frames via PixelLab animate_character + visual QA checkpoint
- [ ] 16.4-02-PLAN.md — Extend build-spritesheet.ts + rebuild 40-row sheet, extend spriteStates.ts, fix OfficePage.tsx player walk render

### Phase 16.5: Walking Animation Rework (INSERTED)

**Goal:** Replace the current broken walking animation with a properly implemented sprite-based system. Based on research into game animation techniques (frame timing, direction-aware row selection, interpolation), deliver a smooth, responsive walk cycle that feels correct to the player.
**Depends on:** Phase 16.4
**Requirements:** animation-timing, animation-direction
**Plans:** 2/2 plans complete

Plans:
- [ ] 16.5-01-PLAN.md — Fix frame timing (100ms) + moonwalk guard (isMoving=dx/dy) with TDD (animation-timing)
- [ ] 16.5-02-PLAN.md — Fix walk row selection (STATE_ROW_OFFSET.walk) + visual QA checkpoint (animation-direction)

### Phase 16.6: Sprite Image Quality Upgrade (INSERTED)

**Goal:** The astronaut and agent sprites currently look blurry and low-quality in-game. Regenerate or upscale the sprite sheets to a higher resolution/fidelity so all characters look crisp and sharp on the canvas at 2× zoom. Replace the current placeholder quality images with proper high-quality pixel art.
**Depends on:** Phase 16.5
**Requirements**: sprite-quality
**Plans:** 2/2 plans complete

Plans:
- [ ] 16.6-01-PLAN.md — Write failing render-quality tests then implement Axis A fix (imageSmoothingEnabled + imageRendering: pixelated) (sprite-quality)
- [ ] 16.6-02-PLAN.md — Visual QA checkpoint: confirm sprites crisp at 2x zoom (sprite-quality)

### Phase 16.7: Wall and Object Collision Physics (INSERTED)

**Goal:** The player character currently walks through walls, furniture, and solid map objects. Implement a proper physics/collision layer that blocks movement into solid tiles and collidable objects. Every solid element on the map must be impassable — walls, desks, pillars, and any other obstacle.
**Depends on:** Phase 16.6
**Requirements**: collision-physics
**Plans:** 2/2 plans complete

Plans:
- [x] TBD (run /gsd:plan-phase 16.7 to break down) (completed 2022-04-13)

### Phase 16.8: Sidebar Design Overhaul (INSERTED)

**Goal:** The current sidebar is visually broken and ugly. Completely redesign the sidebar with clean, polished UI — proper layout, typography, spacing, visual hierarchy, and a coherent style that fits the space/pixel-art theme of the game.
**Depends on:** Phase 16.7
**Requirements**: sidebar-design
**Plans:** 3/3 plans complete

Plans:
- [x] TBD (run /gsd:plan-phase 16.8 to break down) (completed 2022-04-13)

### Phase 16.9: Multi-Map Rendering Fix (INSERTED)

**Goal:** TilemapRenderer currently hard-codes a single `/map/map-composite.png`. A second map was added but only the last one renders. Fix the renderer to load all available map composites (each in their own subdirectory under `/maps/`) and blit them at their correct world-space offsets each frame so every map is visible simultaneously.
**Depends on:** Phase 16.8
**Requirements**: multi-map-render
**Success Criteria** (what must be TRUE):
  1. All map composites found under `/maps/` (e.g. `/maps/map1/map-composite.png`, `/maps/map2/map-composite.png`) are loaded on startup
  2. Each map blits at its configured world-space origin offset (from a manifest or per-map `map.json` boundingBox)
  3. No map is skipped or overwritten — both render every frame in correct layer order
  4. World bounds (`WORLD_W` / `WORLD_H`) expand to cover the union of all loaded map rectangles
  5. Collision and terrain data load correctly for all maps, not just the last
**Plans:** 2/2 plans complete

Plans:
- [x] 16.9-01-PLAN.md — TDD: multi-map TilemapRenderer (manifest load, array blit, worldW/H union) + CollisionMap append/origin opts (multi-map-render)
- [x] 16.9-02-PLAN.md — Wire manifest + multi-map collision load in OfficePage, update GameState world bounds, visual QA checkpoint (multi-map-render)

### Phase 16.10: NPC Spawn Inside Map Fix (INSERTED)

**Goal:** When a new session starts, its NPC character spawns at world coordinates `(0, 0)` which falls in the deep-space void outside the playable map area. Fix NPC seeding so every new agent spawns at a safe, pre-defined position on open walkable floor inside the map, spread across a set of designated spawn slots.
**Depends on:** Phase 16.9
**Requirements**: npc-spawn-position
**Success Criteria** (what must be TRUE):
  1. Every new NPC spawns at a world position that is on walkable floor (not void/wall tiles)
  2. Up to N spawn slots are defined (as pixel coords) at open floor positions near the map centre
  3. When more sessions than spawn slots exist, additional agents cycle through the slots (no overlap stacking — add a small jitter offset)
  4. The player start position (currently hard-coded in `GameState.ts`) is also verified to be on walkable floor
  5. Existing sessions whose NPC position is already set are not relocated
**Plans:** 2/2 plans complete

Plans:
- [x] 16.10-01-PLAN.md — TDD: add failing spawn-slot tests to OfficePage.test.tsx (npc-spawn-position)
- [x] 16.10-02-PLAN.md — Fix NPC seeding useEffect with SPAWN_SLOTS, visual QA checkpoint (npc-spawn-position)

### Phase 16.11: Agent Modal — Terminal UX Redesign (INSERTED)

**Goal:** The InstancePopupHub agent modal has three critical UX problems: (1) black text on dark background makes it unreadable, (2) the Timeline tab lists events oldest-first instead of newest-first, (3) event payloads are raw JSON blobs — hard to read. Redesign the modal into a polished, space-themed terminal interface: beautiful event rendering, reversed timeline, readable contrast, and a live terminal input bar so the user can type commands and send them to the running session.
**Depends on:** Phase 16.10
**Requirements**: modal-terminal-ux
**Design**: Use /frontend-design:frontend-design skill for all UI decisions — contrast, typography, layout, event card design, terminal chrome
**Success Criteria** (what must be TRUE):
  1. All text in the modal is legible at WCAG AA contrast against the dark panel background
  2. Timeline tab shows most-recent event at the top; scrolling down goes further into the past
  3. Each event type renders with a dedicated beautiful card (tool name + formatted params, not raw JSON)
  4. A terminal input bar at the bottom lets the user type and submit a command string to the active session via WebSocket
  5. Modal passes a visual QA checkpoint — designer sign-off on contrast, spacing, and terminal chrome
**Plans:** TBD

Plans:
- [ ] TBD (run /gsd:plan-phase 16.11 to break down)

### Phase 16.12: Provider-Native Session Launch (Claude + Codex) (INSERTED)

**Goal:** Enable launching new Claude and Codex sessions directly from the app UI using provider-native runtimes (strict auto-launch, no manual copy-command fallback). Session becomes active only after real session_start lifecycle events arrive.
**Requirements**: 16.12-R1, 16.12-R2, 16.12-R3, 16.12-R4, 16.12-R5 (SESS-02)
**Depends on:** Phase 16.11
**Plans:** 3/3 plans complete

Plans:
- [x] 16.12-01-PLAN.md — Daemon launch contract: strict-auto semantics, preflight checks, mode=initiated for both providers (TDD) (16.12-R1, 16.12-R2, 16.12-R4, 16.12-R5)
- [x] 16.12-02-PLAN.md — ClaudeLauncher full implementation: settings-file hooks, spawn, hookParser session-ID passthrough (16.12-R1, 16.12-R2, 16.12-R3, 16.12-R5)
- [x] 16.12-03-PLAN.md — UI modal state machine: waiting_for_session_start, event-driven close, 30s timeout (16.12-R1, 16.12-R2, 16.12-R3, 16.12-R4)

### Phase 17: NPC Agent Behavior
**Goal:** Agent NPCs on the map walk smoothly to zone positions based on their session state — coding agents move to the workstation zone, agents waiting for approval move to the meeting room zone — using linear interpolation (no pathfinding).
**Depends on:** Phase 16.11
**Requirements:** npc-zone-movement, session-state-sync
**Success Criteria** (what must be TRUE):
  1. When a session transitions to `coding` state, its NPC walks to the workstation zone (lerp, not instant)
  2. When a session transitions to `waiting` (approval pending), its NPC walks to the meeting room zone
  3. NPCs in all other states (completed, failed, reading, planning) remain in their last position
  4. Multiple NPCs reaching the same zone spread out into sub-positions (no overlap)
  5. NPC positions are driven by live session state from the Zustand store
**Plans:** 2 plans

Plans:
- [ ] 17-01-PLAN.md — Zone definitions (workstation, meeting room) + NPC lerp movement system
- [ ] 17-02-PLAN.md — Session state → zone assignment wiring + multi-NPC spread logic

### Phase 18: Audio System
**Goal:** Ambient office background music plays on loop with volume control, and discrete sound effects fire for key game events (walking, approval granted/denied, agent spawn/despawn, popup open/close).
**Depends on:** Phase 17
**Requirements:** ambient-music, sfx-events, volume-control
**Success Criteria** (what must be TRUE):
  1. Ambient music starts after first user interaction (respects browser autoplay policy) and loops seamlessly
  2. Mute/unmute toggle and separate music/SFX volume sliders work correctly
  3. SFX fires for: player footsteps, approval granted, approval denied, agent spawn, popup open
  4. Audio context is created once and reused (no multiple AudioContext instances)
  5. All audio state (muted, volumes) persists across page reloads via localStorage
**Plans:** 2 plans

Plans:
- [ ] 18-01-PLAN.md — Web Audio API setup, ambient music loop, mute/volume controls
- [ ] 18-02-PLAN.md — SFX system: event → sound wiring for key game events

### Phase 19: Save/Load System
**Goal:** The player can quick-save (F5) and quick-load (F9) game state, with auto-save on key transitions, and full JSON export/import for backup.
**Depends on:** Phase 18
**Requirements:** quick-save, auto-save, json-export
**Success Criteria** (what must be TRUE):
  1. F5 saves player position, camera position, and NPC zone positions to localStorage
  2. F9 restores the saved state with no visual jump (positions applied before first render)
  3. Auto-save triggers on: agent state change, approval decision, session end
  4. Export produces a valid JSON file downloadable by the browser
  5. Import reads the JSON file and restores all saved fields, validating schema before applying
**Plans:** 2 plans

Plans:
- [ ] 19-01-PLAN.md — SaveSystem class (quick save/load slots, localStorage schema)
- [ ] 19-02-PLAN.md — Auto-save triggers + JSON export/import UI (settings panel)

### Phase 20: Game UI Overlays
**Goal:** A HUD with a minimap (top-right) and pending-approval counter (top-left) is rendered as a React overlay. ESC opens a pause menu with resume, settings (audio volumes, reduced motion), and help (keybindings). Action prompts appear when the player is near an agent.
**Depends on:** Phase 19
**Requirements:** hud-minimap, pause-menu, settings-menu, action-prompts
**Success Criteria** (what must be TRUE):
  1. Minimap renders a scaled-down view of the world with agent positions and player dot, updating every frame
  2. Approval counter badge shows live count of pending approvals, clicking navigates to inbox
  3. ESC toggles pause: game loop pauses, pause menu overlays the screen
  4. Settings menu has working sliders for music volume, SFX volume, and a reduced-motion toggle
  5. "Press SPACE to interact" prompt appears when player is within 2 tiles of an agent and disappears otherwise
**Plans:** 3 plans

Plans:
- [ ] 20-01-PLAN.md — HUD component (minimap canvas, approval counter badge)
- [ ] 20-02-PLAN.md — Pause menu + settings menu (audio controls, reduced motion)
- [ ] 20-03-PLAN.md — Action prompt system (proximity detection + prompt display)

### Phase 21: Particle Effects
**Goal:** Three particle effects provide visual feedback for key moments: dust when the player walks, sparkles when interacting with an agent, and success/damage indicators when a session completes or fails.
**Depends on:** Phase 20
**Requirements:** particle-dust, particle-sparkle, particle-events
**Success Criteria** (what must be TRUE):
  1. Small dust puffs appear at player feet each time a step is taken on floor tiles
  2. Sparkle burst fires at agent position when the player opens an agent's popup
  3. Green success burst fires at agent position on `session_completed` event
  4. Red damage indicator fires at agent position on `session_failed` event
  5. Particles are rendered on the Canvas layer and do not cause React re-renders
  6. Particle count is capped (max 200 active) to avoid performance regression
**Plans:** 2 plans

Plans:
- [ ] 21-01-PLAN.md — ParticleSystem class (emitter, update loop, Canvas rendering, cap)
- [ ] 21-02-PLAN.md — Wire dust/sparkle/success/damage emitters to game events
