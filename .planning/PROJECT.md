# Agent Mission Control

## What This Is

Agent Mission Control is a local, browser-based control room for coding agents — starting with Claude Code and Codex. It combines a pixel-art spatial visualization layer (Office mode) with a serious operational control plane (Ops mode) for approvals, memory, replay, diffs and session orchestration. It is aimed at individual developers who run multiple agent sessions and want unified visibility and control, without switching between terminals and tools. **v1.1 adds 2D pixel art game mechanics for Office mode — player-controlled movement, NPC agents that move to activity zones, ambient music, sound effects, and save/load functionality.**

## Core Value

One unified approval, memory and replay layer across Claude Code and Codex — so developers can run agents productively, not just watch them.

## Requirements

### Validated

- ✓ **Session Management** — v1.0-Phase 03
- ✓ **Office Mode** — v1.0-Phase 09
- ✓ **Ops Mode** — v1.0-Phase 03
- ✓ **Approval Inbox** — v1.0-Phase 10
- ✓ **Timeline & Replay** — v1.0-Phase 05
- ✓ **Diff & Artifact Review** — v1.0-Phase 06
- ✓ **Memory Panel** — v1.0-Phase 07
- ✓ **Popup-based Navigation** — v1.0-Phase 14
- ✓ **MapSidebar** — v1.0-Phase 14

### Active

**Game Engine Foundation**
- [ ] Game loop running at 60 FPS with requestAnimationFrame
- [ ] GameState store (separate from React state, updated per frame)
- [ ] Camera/viewport system with smooth following and bounds

**Player Controls**
- [ ] WASD and arrow key movement (smooth pixel-based, not tile-jumping)
- [ ] Click-to-teleport to agent positions (instant, no pathfinding)
- [ ] Mouse/keyboard input tracking for game logic

**NPC Agent Behavior**
- [ ] Agents walk to "coding workstation" zone when coding state
- [ ] Agents walk to "meeting room" zone when waiting for approval
- [ ] Agents stay in place for other states (completed, failed, reading, planning)
- [ ] NPC movement is smooth interpolation between positions

**Audio System**
- [ ] Ambient office background music with continuous loop
- [ ] Sound effects: walking, interacting, approval granted/denied
- [ ] Volume control to mute/unmute music and SFX

**Save/Load System**
- [ ] Quick save (F5) and quick load (F9) slots
- [ ] Auto-save on key actions
- [ ] Export/import save data as JSON
- [ ] Saved data: player position, game state, session data

**Game UI Overlays**
- [ ] HUD with minimap (top-right corner)
- [ ] Pause menu (ESC key)
- [ ] Settings menu (audio, graphics, controls)
- [ ] Action prompts ("Press SPACE to interact")

**Particle Effects**
- [ ] Dust particles when walking on floor tiles
- [ ] Sparkle effects when interacting with agents
- [ ] Success/damage indicators for agent events

### Out of Scope

- Full cloud-hosted orchestration of remote agents — local-first only
- Replacing Claude Code or Codex — this is a control layer, not a runtime
- Enterprise features (SSO, RBAC, audit export)
- Battle mode (automatic prompt fan-out)
- Approval macros/policy rules
- Branch-per-agent workflows
- LAN/remote viewing
- Skins/themes marketplace
- Quest/challenge systems beyond natural gameplay
- Inventory system beyond session management

## Context

- **Inspiration**: Pixel Agents (VS Code extension) proves agent visualization is compelling but is VS Code-bound, Claude-specific, and partly heuristic. v1.0 evolved that concept into a browser-first, provider-agnostic control room with popup navigation. v1.1 adds game mechanics for engagement and delight.
- **Integration surfaces**: Claude Code exposes lifecycle hooks with structured JSON, persistent memory (CLAUDE.md, auto memory), and subagent support. Codex exposes JSONL event streams, resumable sessions, configurable approval policy, and an app-server for rich clients.
- **Target users**: Primary — solo developer running multiple Claude/Codex sessions wanting unified visibility. Secondary — small technical team. Tertiary — creator/OSS dev who values demoability.
- **Existing codebase**: v1.0 complete with React frontend (Vite), local daemon (Node.js, SQLite), WebSocket real-time updates, Zustand state management, 9 character types with sprite sheets, Radix UI components.
- **Game mechanics research**: Canvas API for rendering, requestAnimationFrame game loops, Web Audio API for sound, localStorage for save data, collision detection, smooth interpolation (lerp), camera systems.

## Constraints

- **Architecture**: Local daemon + browser UI with game engine — no cloud backend for core functionality
- **Performance**: 60 FPS target, sub-50ms frame time budget, responsive with 10+ concurrent agents
- **Stack**: React + Canvas API hybrid (Canvas for game layer, React for UI overlay), TypeScript, Vite, Zustand
- **Audio**: Web Audio API, no external audio engines
- **Storage**: localStorage + IndexedDB for save persistence, no server-side saves
- **Compatibility**: Modern browsers (Chrome, Firefox, Safari, Edge), desktop-first (mobile exploration later)
- **Privacy**: All session data stored locally; game state also local

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Browser-first, local daemon architecture | Overcomes VS Code extension limitations; supports cross-editor usage | ✓ Good |
| Claude adapter uses hooks (not transcript observation) | Transcript heuristics misfire; hooks give structured, reliable lifecycle events | ✓ Good |
| Codex adapter: app-server + JSONL exec path | App-server provides approvals + streaming; JSONL exec is fallback | ✓ Good |
| SQLite for v1 persistence | Sufficient for local-first use; enables replay, search, crash recovery | ✓ Good |
| Canvas for game layer, React for UI overlay | Canvas gives 60 FPS performance; React handles UI state cleanly | — Pending |
| Popup-based navigation (v1.0) | Prevents "too gimmicky" failure mode; Ops mode remains accessible | ✓ Good |
| NPC movement zones based on agent state | Simple, understandable behavior pattern; easy to extend later | — Pending |
| Teleport on agent click (not pathfind) | Faster UX; pathfinding deferred to future if needed | — Pending |
| WASD for player movement | Classic game control scheme; familiar to gamers | — Pending |

---
*Last updated: 2026-04-10 after v1.1 milestone kickoff*
