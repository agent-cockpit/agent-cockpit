---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: — 2D Pixel Art Game Experience
status: completed
stopped_at: Completed phase 16.10 execution + verification
last_updated: "2026-04-13T22:16:05.115Z"
last_activity: 2026-04-13 — Completed phase 16.10 execution + verification
progress:
  total_phases: 24
  completed_phases: 14
  total_plans: 50
  completed_plans: 44
  percent: 92
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** One unified approval, memory and replay layer across Claude Code and Codex — so developers can run agents productively, not just watch them.
**Current focus:** Planning v1.1 — 2D Pixel Art Game Experience

## Current Position

Phase: 16.11 — Agent Modal — Terminal UX Redesign
Plan: TBD
Status: Ready — run planning for 16.11
Last activity: 2026-04-13 — Completed phase 16.10 execution + verification

Progress: [█████████░] 92%

## v1.0 Completed

All 14 phases complete:
- Phase 1: Daemon Core
- Phase 2: Claude Adapter (Approval Foundation)
- Phase 3: Browser UI Shell (Session Management)
- Phase 4: Codex Adapter
- Phase 5: Timeline Replay
- Phase 6: Diff & Artifact Review
- Phase 7: Memory Panel
- Phase 8: Session History & Search
- Phase 9: Office Mode (Pixel Art Visualization)
- Phase 10: Approval Inbox UI
- Phase 10.1: Session Tracking Bug Fix
- Phase 10.2: Pixel Art Asset Production
- Phase 14: Office Map View — Full Navigation Paradigm Shift

**Key deliverable**: Popup-based navigation, MapSidebar, InstancePopupHub with 5 tabs, HistoryPopup modal

## v1.1 Goals

Transform Office Mode from a static visualization into an engaging 2D pixel art game experience:

**Core Mechanics:**
- Player-controlled movement (WASD, arrow keys)
- Click-to-teleport to agents
- NPC agents that move to activity zones
- 60 FPS game loop with smooth animations

**Atmosphere:**
- Ambient office background music
- Sound effects for actions
- Particle effects for visual feedback

**Persistence:**
- Quick save/load system
- Auto-save on key actions
- All game state preserved

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:
- Roadmap: v1.1 adds game engine on top of existing React/Zustand architecture
- v1.1: Canvas for game rendering, React for UI overlay (hybrid approach)
- v1.1: NPC movement zones: coding → workstation, waiting for approval → meeting room
- v1.1: Teleport on agent click (no pathfinding), WASD for player movement
- v1.1: Ambient music with volume control + SFX
- v1.1: Save data: player position, game state, session data (not agent positions)

All v1.0 decisions remain active and respected.
- [Phase 15]: Added _loop stop-guard (rafId===null check) to prevent update() firing after stop() when a pending rAF callback exists
- [Phase 15]: Global HTMLCanvasElement.getContext and ResizeObserver stubs added to setupTests.ts to prevent jsdom crashes in all canvas-using tests
- [Phase 15]: GameEngine subclassed inline (anonymous class) inside OfficePage useEffect for clarity and co-location
- [Phase 15-game-engine-foundation]: Static blit only in Phase 15 (col=0); animation stepping deferred to Phase 20
- [Phase 15-game-engine-foundation]: AgentSprite.tsx no longer exports React component — only drawAgentSprite() canvas function
- [Phase 15-game-engine-foundation]: DnD (@dnd-kit) removed from OfficePage/AgentSprite; gameState.npcs is now the source of truth for NPC positions
- [Phase 15-game-engine-foundation]: Static blit only in Phase 15 (col=0 always); animation frame stepping deferred to Phase 20
- [Phase 15-game-engine-foundation]: DnD (@dnd-kit) fully removed from OfficePage and AgentSprite; gameState.npcs is sole NPC position source of truth
- [Phase 15-game-engine-foundation]: AgentSprite.tsx no longer exports React component — only drawAgentSprite() canvas function; imageCache as useRef Map
- [Phase 16-player-controls]: PlayerInput uses pure function movePlayer() with explicit player/keys/deltaMs params for full testability without mocking module state
- [Phase 16-player-controls]: attachInput/detachInput co-located with engine.start()/stop() in single useEffect to guarantee teardown
- [Phase 16-player-controls]: Teleport moves gameState.player.x/y to NPC position so update() camera-follow stays consistent — moving only camera is reverted on next tick
- [Phase 16.1-01]: zoom field on CameraState applied in render (canvas.scale), not in updateCamera — keeps camera math zoom-agnostic
- [Phase 16.1-01]: Wave 0 TDD: TilemapRenderer test stubs in RED state intentionally — module created in Plan 02
- [Phase 16.1-map-rendering-camera-zoom]: Objects/overlays use pixel world-space coords directly from JSON (no tile offset); tilesetId from first present edge in transition cells
- [Phase 16.1-map-rendering-camera-zoom]: map-composite.png fallback: used pre-rendered composite export instead of reconstructing from Wang tileset PNGs (only 2 of 7 present)
- [Phase 16.1-map-rendering-camera-zoom]: Zoom applied via ctx.scale in render(), not in camera math — keeps Camera.ts zoom-agnostic
- [Phase 16.2-walking-animation]: animTime stored as raw ms total; frame col derived at render site via Math.floor(animTime/150)%4
- [Phase 16.2-walking-animation]: isMoving uses key booleans directly (up||down||left||right) before INV_SQRT2 normalization
- [Phase 16.2-walking-animation]: tick: number required (not optional) in DrawAgentSpriteOptions — prevents silent NaN frames at all call sites
- [Phase 16.2-walking-animation]: NPC_FRAME_COUNTS inlined in drawAgentSprite() body — co-located with usage, avoids unnecessary export surface
- [Phase 16.2-walking-animation]: tick: number required (not optional) in DrawAgentSpriteOptions — forces callers to update, prevents silent NaN frames
- [Phase 16.2-walking-animation]: NPC_FRAME_COUNTS inlined in drawAgentSprite() body — co-located with usage, avoids unnecessary export surface
- [Phase 16.2-walking-animation]: Walk rows in sprite sheet start at row +8 (STATE_ROW_OFFSET.blocked); rows 0-7 are idle/standing frames only
- [Phase 16.2-walking-animation]: WALK_FRAME_COUNT raised 4->8 to match actual walking animation frames in the sprite sheet
- [Phase 16.4]: walking-8-frames template worked on first attempt — 8 frames per direction, matches WALK_FRAME_COUNT
- [Phase 16.4]: PixelLab v2 REST API called directly (MCP not available in subagent) — RGBA bytes decoded via sharp.raw() to PNG
- [Phase 16.4]: walking-8-frames template worked on first attempt — 8 frames per direction, matches WALK_FRAME_COUNT
- [Phase 16.4]: PixelLab v2 REST API called directly (MCP not available in subagent) — RGBA bytes decoded via sharp.raw() to PNG
- [Phase 16.4-02]: STATE_ROW_OFFSET.walk=32 — walk rows appended after failed=24; walk is player-only state not added to NPC COLOR_STATE_TO_ANIMATION
- [Phase 16.4-02]: Walk frame count is 8 — matches existing WALK_FRAME_COUNT constant, no PlayerInput.ts change needed
- [Phase 16.5-walking-animation-rework]: WALK_FRAME_DURATION_MS=100: 10fps walk cycle matches natural humanoid gait; 150ms was visually too slow
- [Phase 16.5-walking-animation-rework]: isMoving = dx !== 0 || dy !== 0: displacement-based guard prevents moonwalk when opposing keys cancel
- [Phase 16.5-walking-animation-rework]: STATE_ROW_OFFSET.walk=32 was already added in Phase 16.4-02 (commit b24fe6b) — no duplication needed for 16.5-02
- [Phase 16.5-walking-animation-rework]: STATE_ROW_OFFSET.walk=32 was already added in Phase 16.4-02 (commit b24fe6b) — no duplication needed; plan verified it exists and wired OfficePage to it
- [Phase 16.6-sprite-image-quality-upgrade]: imageSmoothingEnabled=true before tilemap blit (bilinear preserved for pre-rendered composite map), false before sprites
- [Phase 16.6-sprite-image-quality-upgrade]: imageRendering: pixelated on canvas element covers DPR scaling via CSS, not just Canvas 2D API
- [Phase 16.6-sprite-image-quality-upgrade]: Defensive imageSmoothingEnabled=false in drawAgentSprite() as belt-and-suspenders guard
- [Phase 16.7-wall-and-object-collision-physics]: Sparse Set keyed tileX,tileY for O(1) solid-tile lookup — avoids 10K+ entry array
- [Phase 16.7-wall-and-object-collision-physics]: Character: objects are non-solid ambient sprites — not collidable obstacles
- [Phase 16.7-wall-and-object-collision-physics]: collisionMap declared before engine anonymous class so closure in update() can reference it
- [Phase 16.7-wall-and-object-collision-physics]: Axis-separated slide: X and Y blocked checks use current player position for cross-axis — prevents diagonal stop at corners
- [Phase 16.8-sidebar-design-overhaul]: MapSidebar now performs local lastEventAt descending sort to preserve selector behavior elsewhere
- [Phase 16.8-sidebar-design-overhaul]: MapSidebar row click contract is selectSession(sessionId) before onFocusSession(sessionId)
- [Phase 16.8-sidebar-design-overhaul]: Status mapping aligned to SessionStatus active|ended|error with text+dot semantics
- [Phase 16.8-sidebar-design-overhaul]: Secondary metadata line is conditional: pending approvals or non-active status
- [Phase 16.8-sidebar-design-overhaul]: Defined semantic Tailwind v4 tokens in index.css instead of local hardcoded utility colors.
- [Phase 16.8-sidebar-design-overhaul]: Implemented desktop-only resize handle via matchMedia('(min-width: 1024px)') with width clamp [260, 460].
- [Phase 16.8]: Set both camera target and current coordinates during sidebar focus to preserve immediate snap behavior.
- [Phase 16.8]: Update player coordinates alongside camera so follow logic does not pull camera away on later frames.
- [Phase 16.8]: Treat checkpoint Task 3 as complete from explicit user approval in resume context.
- [Phase 16.9]: TilemapRenderer now loads map composites from /maps/maps-manifest.json and computes world bounds from manifest extents.
- [Phase 16.9]: CollisionMap loadTerrain/loadObjects now accept optional tile/world origin and append flags with backward-compatible defaults.
- [Phase 16.9]: Continuation resumed from checkpoint with explicit user approval for Task 2
- [Phase 16.9]: Out-of-scope full-suite test failures were logged to deferred-items.md instead of being fixed in this plan
- [Phase 16.10]: Plan 16.10-01 keeps SPAWN_SLOTS inline in tests because production constant is introduced in Plan 16.10-02.
- [Phase 16.10]: OfficePage click-hit test now pins sess-1 at origin explicitly so selection behavior remains isolated from spawn policy changes.
- [Phase 16.10]: Spawn slots validated against PLAYER_HITBOX collision overlap, not terrain tile type alone.
- [Phase 16.10]: Preserved user-owned PLAYER_HITBOX debug rendering diff as unstaged work while committing only spawn-slot/task-test updates.

### Roadmap Evolution

- v1.0 completed: Office map as default view, popup-based navigation
- v1.1 planned: Game engine foundation → player controls → NPC behavior → audio system → save/load → UI overlays
- Phase 16.1 inserted after Phase 16: Map Rendering & Camera Zoom — replace hardcoded world with Cockpit Map-export tilemap (Wang tilesets, 3232×3232px), camera zoom, map overlay + placed objects (INSERTED, prerequisite for Phase 17 NPC zone placement)
- Phase 16.6 inserted after Phase 16.5: Sprite Image Quality Upgrade — regenerate/upscale sprite sheets so characters look crisp at 2× zoom (URGENT — current sprites too blurry)
- Phase 16.7 inserted after Phase 16.6: Wall and Object Collision Physics — player walks through walls/objects; implement proper collision layer for all solid tiles and map objects (URGENT)
- Phase 16.8 inserted after Phase 16.7: Sidebar Design Overhaul — current sidebar design is broken/ugly; full redesign with proper layout, typography, and space theme styling (URGENT)
- Phase 16.9 inserted after Phase 16.8: Multi-Map Rendering Fix — second map added but only the last renders; fix TilemapRenderer to load and blit all map composites
- Phase 16.10 inserted after Phase 16.9: NPC Spawn Inside Map Fix — new session agents spawn at (0,0) which is deep-space void; define safe spawn slots on walkable floor
- Phase 16.11 inserted after Phase 16.10: Agent Modal Terminal UX Redesign — black text on dark bg, timeline order wrong, raw JSON messages; full redesign with terminal input (uses /frontend-design)

### Pending Todos

None yet — requirements phase will surface tasks.

### Blockers/Concerns

- Game engine performance: need to ensure Canvas rendering doesn't impact React responsiveness
- Audio loading: browser autoplay policies may require user interaction first
- Save system complexity: what exactly constitutes "game state" to save?
- NPC behavior: how to make zone movement feel natural, not robotic

## Session Continuity

Last session: 2026-04-13T22:09:06.069Z
Stopped at: Completed 16.10-02-PLAN.md
Resume file: None

*Updated after each plan completion*
