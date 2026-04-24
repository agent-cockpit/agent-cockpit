# Agent Cockpit

> A local-first control room for running multiple coding agents at the same time. Turns Claude Code and Codex sessions into something you can actually see, manage, approve, and review — with a pixel-art office on top and a full operational control plane underneath.

![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen) ![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-blue) ![pnpm](https://img.shields.io/badge/pnpm-workspace-orange) ![License](https://img.shields.io/badge/license-MIT-green) ![Status](https://img.shields.io/badge/status-v1.1%20in%20progress-yellow)

## Table of Contents

- [The Idea](#the-idea)
- [Features](#features)
  - [Office Mode](#office-mode)
  - [Operations Control Plane](#operations-control-plane)
  - [Unified Approvals](#unified-approvals)
  - [Timeline and Replay](#timeline-and-replay)
  - [Diff and Artifact Review](#diff-and-artifact-review)
  - [Memory Panel](#memory-panel)
  - [Session Chat](#session-chat)
  - [Session History](#session-history)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
  - [System Overview](#system-overview)
  - [Data Flow](#data-flow)
  - [Package Structure](#package-structure)
- [Stack](#stack)
- [Requirements](#requirements)
- [Installation](#installation)
  - [1. Install Claude Code CLI](#1-install-claude-code-cli)
  - [2. Install Codex CLI](#2-install-codex-cli)
  - [3. Clone and install](#3-clone-and-install)
  - [4. Configure Claude Hooks](#4-configure-claude-hooks)
  - [5. Start the application](#5-start-the-application)
- [Available Scripts](#available-scripts)
- [Usage](#usage)
- [Characters](#characters)
- [Configuration](#configuration)
- [Project Status](#project-status)
- [Roadmap](#roadmap)
- [Known Limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## The Idea

If you run several agent sessions at once, the hard part is not launching them. The hard part is knowing:

- what each agent is doing right now
- which session needs your attention
- which approval is safe to grant
- what changed in the repository
- how to find the session again later

Agent Cockpit solves that by combining a **visual game-like office map** with a **structured operations dashboard**. Each active session appears as an animated character in a pixel-art office. Approvals from both Claude Code and Codex land in a single unified inbox. Every event is persisted locally so you can replay, inspect, and audit what happened.

The goal is to replace terminal sprawl with one interface for visibility, approvals, diffs, memory, history, and live agent status.

---

## Features

### Office Mode

The map is the default view and the spatial heart of the product.

- **Pixel-art office map** — a 3232×3232 px tiled world rendered on Canvas 2D at 60 FPS
- **Agent characters** — each active session appears as an animated NPC on the map; 10 character types available
- **Player character** — you have your own character you can move around the map with WASD or arrow keys
- **8-directional movement** — smooth walk cycle with proper frame timing (not tile-jumping)
- **Collision physics** — walls, desks, and objects are solid; only walkable floor tiles let you through
- **NPC behavior** — agents wander the map autonomously; when an approval is pending they move toward the interaction zone; they freeze when you open their popup
- **Click to interact** — click any agent to open its full session detail popup (Chat tab opens by default)
- **Hover cards** — hover over an agent to see provider badge, task title, status, pending approvals count, last tool, and elapsed time
- **Character picker** — choose which character you play as from 10 options; selection persists across reloads
- **Camera system** — smooth lerp follow with world-edge clamping; 2× zoom; clicking an agent snaps the camera to it
- **Ambient audio** — background music loops seamlessly after first user interaction (respects browser autoplay policy)
- **Sound effects** — walking, approval events, popup open/close (Web Audio API, volume persists to localStorage)
- **Map sidebar** — slim active session list on the left edge; resizable on desktop; shows face portrait, status dot, pending approvals pill

### Operations Control Plane

Accessible from any agent popup via its tabs, or via the Ops route.

- **Session list** — all active Claude Code and Codex sessions discovered automatically in one view
- **Session launch** — launch new Claude or Codex sessions directly from the UI (selects repo, provider, starts the process)
- **Session termination** — kill managed sessions from UI with confirmation; unsupported for externally attached sessions (explained in UI)
- **Provider badges** — visual distinction between Claude and Codex sessions
- **Status indicators** — active, ended, error, with live updates over WebSocket

### Unified Approvals

Approvals from Claude Code and Codex land in a single inbox.

- **One queue** — both providers' approval requests appear together
- **Risk classification** — each approval is classified by action type (shell command, network access, file change, sandbox escalation, MCP tool call, user-input elicitation) and risk level
- **Decision options** — approve once, deny once, or always-allow a similar action within the session
- **Detail view** — see the proposed action, affected files/host, why it's risky, and the last related event before deciding
- **Auto-deny on timeout** — approvals not decided within the configured window are auto-denied, unblocking the agent
- **Persistent decisions** — all decisions (approve/deny/always-allow/timeout) are stored in SQLite and visible in session history
- **Approval balloons** — visual indicators on the map when a session has pending approvals

### Timeline and Replay

- **Chronological event feed** — every session event in order: task created, plan updates, tool calls, command runs, file changes, approvals requested/resolved, subagent spawn/complete, memory read/write, completion/failure
- **Scrubbing** — jump directly to approval events or file-change events
- **Filtering** — filter the timeline by event type
- **Event detail** — click any event to inspect its related output, diff, or approval details
- **Most-recent first** — newest events at the top; scroll down into the past

### Diff and Artifact Review

- **File tree** — all files changed during a session
- **Per-file diffs** — raw unified diff view for any changed file
- **Session summary** — files touched, final status, elapsed time

### Memory Panel

- **Unified surface** — project memory from CLAUDE.md and provider-specific files normalized into one view
- **Inline editing** — edit memory directly in the UI; changes written back to disk
- **New notes** — create notes and pin them to a project
- **Suggested updates** — review and approve or reject agent-suggested memory changes before they are written

### Session Chat

Sessions launched from the UI (daemon-managed) support a live bidirectional chat channel:

- **Chat tab** — message history and input composer in the agent popup
- **Send messages** — type and submit commands to the running session
- **Capability awareness** — externally attached sessions (not launched from UI) show "approval-only" mode with an explanation; send is disabled and explained, never silently dropped

### Session History

- **Browsable history** — filterable and searchable list of all past sessions
- **Reopen** — click any historical session to view its full timeline, memory state, and diffs
- **Session comparison** — select two sessions side-by-side: provider, runtime, approval count, files changed, final status

---

## How It Works

Agent Cockpit has three layers:

```
1. Provider Layer
   Claude Code and Codex emit events and approvals through their native surfaces.
   Claude → HTTP lifecycle hooks  |  Codex → app-server stdio JSON-RPC 2.0

2. Daemon Layer  (packages/daemon)
   A local Node.js daemon normalizes provider events, stores them in SQLite (WAL mode),
   and broadcasts live updates over a single multiplexed WebSocket connection.

3. Browser UI  (packages/ui)
   A React + Canvas 2D app consumes live events and updates the office map,
   operational panels, and session detail popups in real time.
```

The approval flow end-to-end:

```
Agent performs an action
  │
  ▼  (HTTP hook or JSON-RPC)
Daemon receives the event
  │
  ▼
Event normalized → persisted to SQLite → broadcast over WebSocket
  │
  ▼
Browser: approval request appears in inbox
  │
  ▼
You approve / deny / always-allow
  │
  ▼  (WebSocket message → daemon)
Approval Manager resolves the pending Promise
  │
  ▼  (HTTP response to Claude or JSON-RPC result to Codex)
Agent continues
```

---

## Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                          PROVIDER LAYER                                │
│  ┌──────────────────────────┐     ┌──────────────────────────────────┐ │
│  │    Claude Code           │     │    OpenAI Codex                  │ │
│  │  HTTP hooks per session  │     │  app-server (stdio JSON-RPC 2.0) │ │
│  │  PreToolUse, Permission  │     │  thread/turn/item lifecycle      │ │
│  │  SessionStart/Stop, etc. │     │  approval request/response       │ │
│  └────────────┬─────────────┘     └────────────────┬─────────────────┘ │
└───────────────┼──────────────────────────────────-─┼───────────────────┘
                │ HTTP POST                           │ stdio / JSON-RPC
                ▼                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   DAEMON  (Node.js + TypeScript)                       │
│                                                                        │
│  ┌──────────────────────┐   ┌──────────────────────────────────────┐   │
│  │   Claude Adapter     │   │   Codex Adapter                      │   │
│  │  hookServer.ts       │   │  codexAdapter.ts (child_process)     │   │
│  │  hookParser.ts       │   │  codexParser.ts                      │   │
│  │  riskClassifier.ts   │   │  codexRiskClassifier.ts              │   │
│  │  claudeLauncher.ts   │   │                                      │   │
│  └──────────┬───────────┘   └──────────────────────┬───────────────┘   │
│             └───────────────────────┬──────────────┘                   │
│                                     ▼                                  │
│              ┌───────────────────────────────────────────────┐         │
│              │         Internal Event Bus (EventEmitter)     │         │
│              └──────────┬───────────────────┬────────────────┘         │
│                         │                   │                          │
│                ▼        ▼                   ▼                          │
│  ┌──────────────────┐  ┌────────────────┐  ┌───────────────────────┐  │
│  │  SQLite Writer   │  │  WS Server     │  │  Approval Manager     │  │
│  │  (WAL mode)      │  │  ws.ts         │  │  approvalQueue.ts     │  │
│  │  events          │  │  handlers.ts   │  │  approvalStore.ts     │  │
│  │  sessions        │  │  typed msgs    │  │  timeout auto-deny    │  │
│  │  approvals       │  │  broadcast all │  │                       │  │
│  │  memory          │  │                │  │                       │  │
│  └──────────────────┘  └────────────────┘  └───────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                │ WebSocket            │ REST (history queries)
                ▼                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   BROWSER UI  (React + Vite)                           │
│                                                                        │
│  useSessionEvents.ts  →  Zustand store  →  React components           │
│                                                                        │
│  ┌───────────────────┐  ┌──────────────────────┐  ┌────────────────┐  │
│  │  OfficePage       │  │  InstancePopupHub    │  │  Approval      │  │
│  │  Canvas 2D game   │  │  Tabs: Chat, Appr.   │  │  Inbox         │  │
│  │  GameEngine.ts    │  │  Timeline, Diff      │  │                │  │
│  │  Camera.ts        │  │  Memory, Artifacts   │  │                │  │
│  │  CollisionMap.ts  │  └──────────────────────┘  └────────────────┘  │
│  │  TilemapRenderer  │                                                 │
│  │  NpcBehavior.ts   │  ┌──────────────────────┐  ┌────────────────┐  │
│  │  PlayerInput.ts   │  │  OpsLayout           │  │  HistoryPage   │  │
│  └───────────────────┘  │  SessionListPanel    │  │  SearchBar     │  │
│                         │  SessionDetailPanel  │  │  ComparePanel  │  │
│                         └──────────────────────┘  └────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

**Event flow** (provider → SQLite → browser):

1. Claude Code fires an HTTP POST hook → Claude Adapter normalizes it to `NormalizedEvent`
2. Event published to the internal EventBus
3. SQLite Writer appends it (append-only, never UPDATE)
4. WebSocket Server broadcasts it to all connected browser clients
5. Zustand store updates → React re-renders / Canvas frame

**Reconnect / refresh**:

On connect the daemon sends a full snapshot `{ type: 'init', sessions, pendingApprovals }`. Subsequent messages are incremental. No REST polling needed.

**Timeline replay**:

`GET /api/sessions/:id/events` returns the ordered event array from SQLite. The UI folds events with `reduce(applyEvent, initialState)` to reconstruct session state at any point in time.

### Package Structure

```
agent-cockpit/
├── packages/
│   ├── daemon/                      # Node.js TypeScript daemon
│   │   └── src/
│   │       ├── adapters/
│   │       │   ├── claude/          # HTTP hook server + parser + risk classifier + launcher
│   │       │   └── codex/           # app-server child process + JSON-RPC parser + risk classifier
│   │       ├── approvals/           # Approval queue, store, timeout handling
│   │       ├── db/                  # better-sqlite3 setup, queries
│   │       ├── memory/              # CLAUDE.md reader, memory notes
│   │       ├── notifications/       # Notification helpers
│   │       ├── platform/            # Platform-specific launch helpers (darwin, linux, win32)
│   │       ├── ws/                  # WebSocket server, typed message handlers
│   │       ├── eventBus.ts          # Typed EventEmitter wrapper
│   │       └── index.ts             # Daemon entrypoint
│   │
│   ├── ui/                          # React + Vite browser UI
│   │   └── src/
│   │       ├── audio/               # Web Audio API: ambient music + SFX system
│   │       ├── components/
│   │       │   ├── layout/          # MapSidebar, OpsLayout, SessionListPanel, SessionDetailPanel
│   │       │   ├── office/          # AgentSprite, AgentHoverCard, InstancePopupHub, HistoryPopup,
│   │       │   │                    #   MenuPopup, ClosetPopup, MiniMap, spriteStates
│   │       │   ├── panels/          # ApprovalInbox, Timeline, Diff, Memory, Chat, Artifacts, Compare
│   │       │   ├── sessions/        # LaunchSessionModal, CharacterPicker, SessionCard, SessionFilters,
│   │       │   │                    #   TerminateSessionDialog
│   │       │   └── start/           # StartPage, StartMenu, CockpitScene, SettingsDialog
│   │       ├── game/                # Canvas 2D game engine
│   │       │   ├── GameEngine.ts    # requestAnimationFrame loop (60 FPS target)
│   │       │   ├── GameState.ts     # Game state (player, NPCs, camera) — outside React
│   │       │   ├── Camera.ts        # Lerp follow, zoom, world-edge clamping
│   │       │   ├── CollisionMap.ts  # Sparse-set solid-tile lookup
│   │       │   ├── TilemapRenderer.ts # Multi-map composite blit
│   │       │   ├── NpcBehavior.ts   # NPC autonomous movement + interaction freeze
│   │       │   ├── NpcPathfinding.ts
│   │       │   └── PlayerInput.ts   # WASD/arrow input, movement, direction
│   │       ├── hooks/               # useSessionEvents, useLocalStorage
│   │       ├── pages/               # OfficePage, HistoryPage, StartPage
│   │       └── store/               # Zustand slices: sessions, approvals, events, ws, ui
│   │
│   └── shared/                      # Shared event types and Zod schemas
│       └── src/                     # NormalizedEvent, WsMessage union, approval types
│
├── assets/raw/                      # Source sprite sheets and map exports
│   ├── alien/ astronaut/ caveman/ ghost/ hologram/
│   ├── medicine-woman/ monkey/ ninja/ pirate/ robot/
│   ├── tiles/                       # Wang tilesets
│   └── Cockpit Map Export/          # Tiled map export (101×101 tiles, 32px each)
│
├── scripts/
│   ├── build-spritesheet.ts         # Assemble character sprite sheets with sharp
│   ├── copy-faces.ts                # Export face portraits to public/sprites/faces/
│   ├── sync-map.ts                  # Sync map export assets to public/maps/
│   └── validate-sprites.ts          # Validate sprite sheet dimensions and frame counts
│
└── .planning/                       # Product vision, requirements, roadmap, current state
```

---

## Stack

### Daemon

| Package | Version | Purpose |
|---------|---------|---------|
| Node.js | ≥22 | Runtime (native TypeScript strip-types support) |
| TypeScript | ^5.0 | Type safety across daemon and shared types |
| tsx | latest | TypeScript runner + watch mode (replaces ts-node) |
| better-sqlite3 | ^12.8 | Synchronous SQLite driver, WAL mode, append-only events |
| ws | ^8.18 | Low-level WebSocket server, zero-dependency |
| zod | ^4.0 | Runtime schema validation for hook payloads at daemon boundary |
| node-pty | ^1.1 | PTY-backed process spawning for Claude/Codex sessions |

### Browser UI

| Package | Version | Purpose |
|---------|---------|---------|
| React | ^18.3 | UI framework |
| Vite | ^6.0 | Build tool and dev server |
| TypeScript | ^5.0 | Type safety |
| Zustand | ^5.0 | WebSocket-driven state (updates from outside React) |
| Tailwind CSS | ^4.0 | Utility CSS |
| Radix UI | ^1.x | Accessible dialogs, hover cards, tabs |
| react-router | ^7.0 | Client-side routing |
| sharp | ^0.34 | Sprite sheet assembly in build scripts |
| Canvas 2D API | native | 60 FPS game rendering layer |
| Web Audio API | native | Ambient music and sound effects |

### Tooling

| Tool | Purpose |
|------|---------|
| pnpm workspaces | Monorepo package management |
| vitest | Unit and integration tests across all packages |
| @testing-library/react | React component tests |

---

## Requirements

- **Node.js 22 or newer** — required for native TypeScript support and ESM
- **pnpm** — workspace management (`npm i -g pnpm`)
- **Claude Code CLI** — for Claude Code session integration
- **Codex CLI** — for Codex session integration (optional)
- **Desktop OS** — Linux, macOS, or Windows
- **Modern browser** — Chrome, Firefox, Safari, or Edge (desktop)
- **Local filesystem access** — all data is stored locally; no cloud backend

---

## Installation

### 1. Install Claude Code CLI

**macOS / Linux:**

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://claude.ai/install.ps1 | iex
```

**Or via npm (all platforms):**

```bash
npm install -g @anthropic-ai/claude-code
claude auth login
```

### 2. Install Codex CLI

```bash
npm install -g @openai/codex
```

Set your OpenAI API key:

```bash
# macOS / Linux
export OPENAI_API_KEY=sk-...

# Windows PowerShell
$env:OPENAI_API_KEY = "sk-..."
```

### 3. Install Agent Cockpit

**Via npx (recommended):**

```bash
npx agent-cockpit
```

**Or clone for development:**

```bash
git clone https://github.com/agent-cockpit/agent-cockpit.git
cd agent-cockpit
pnpm install
```

### 4. Configure Claude Hooks

Agent Cockpit receives Claude Code events through HTTP lifecycle hooks. Add the following to your global Claude settings at `~/.claude/settings.json` (create the file if it does not exist):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:54322/hooks/claude -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:54322/hooks/claude -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:54322/hooks/claude -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:54322/hooks/claude -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ]
  }
}
```

> **Windows note:** Replace `curl` with the full path to `curl.exe`, or ensure `curl` is on your PATH. PowerShell's `curl` alias points to `Invoke-WebRequest` and will not work.

You can also configure hooks at the project level by placing the same JSON in `.claude/settings.json` inside a specific repo.

### 5. Start the application

**If installed via npx**, it starts automatically and opens your browser.

**If running from source:**

```bash
pnpm dev
```

Open [http://localhost:54321](http://localhost:54321) in your browser.

On **Windows**, make sure both `claude` and `codex` are available on `PATH` in the same shell where you start the daemon. The daemon spawns them as child processes.

---

## Available Scripts

**Root (monorepo):**

| Script | What it does |
|--------|-------------|
| `pnpm test` | Run all tests across all packages |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Type-check the monorepo root |
| `pnpm sync-map` | Sync Tiled map export assets to `packages/ui/public/maps/` |
| `pnpm copy-faces` | Export character face portraits to `packages/ui/public/sprites/faces/` |

**`packages/daemon`:**

| Script | What it does |
|--------|-------------|
| `pnpm --filter @cockpit/daemon start` | Start daemon (production) |
| `pnpm --filter @cockpit/daemon dev` | Start daemon with hot-reload (tsx watch) |
| `pnpm --filter @cockpit/daemon test` | Run daemon tests |
| `pnpm --filter @cockpit/daemon typecheck` | Type-check daemon |

**`packages/ui`:**

| Script | What it does |
|--------|-------------|
| `pnpm --filter @cockpit/ui dev` | Start Vite dev server |
| `pnpm --filter @cockpit/ui build` | Production build |
| `pnpm --filter @cockpit/ui preview` | Preview production build |
| `pnpm --filter @cockpit/ui test` | Run UI tests |
| `pnpm --filter @cockpit/ui typecheck` | Type-check UI |

---

## Usage

1. **Open the UI** — navigate to `http://localhost:5173` in your browser. You land on the Start Page.
2. **Enter the office** — click "Enter" to go to the Office map.
3. **Connect sessions** — launch new sessions from the sidebar launch button (Claude or Codex), or start `claude` / `codex` in any terminal — they connect automatically once hooks are configured.
4. **Watch agents appear** — session characters spawn on the map and begin animating based on their state (idle, walking, waiting for approval).
5. **Move around** — use WASD or arrow keys to walk your character around the office. Click any agent to teleport the camera to it and open its popup.
6. **Handle approvals** — when an agent needs your approval (red indicator on the map and a badge in the sidebar), click the agent, go to the Approvals tab, review the action and risk level, then approve, deny, or always-allow.
7. **Inspect activity** — open the Timeline tab to see all events in reverse-chronological order. Open the Diff tab to see what files changed.
8. **Read and update memory** — open the Memory tab to see and edit the project's CLAUDE.md and any memory notes.
9. **Chat with agents** — for daemon-launched sessions, type in the Chat tab to send messages directly to the running session.
10. **Review history** — open the History popup (📋 icon in the sidebar) to browse and reopen past sessions.
11. **Pick your character** — click the character icon in the top bar to open the character picker and choose who you play as.

---

## Characters

Ten character types are available, each with its own sprite sheet and face portrait:

| Character | Description |
|-----------|-------------|
| Astronaut | Default space explorer |
| Alien | Extraterrestrial visitor |
| Caveman | Prehistoric coder |
| Ghost | Spectral presence |
| Hologram | Digital projection |
| Medicine Woman | Healing practitioner |
| Monkey | Primate programmer |
| Ninja | Silent operator |
| Pirate | Swashbuckling dev |
| Robot | Mechanical assistant |

Each character has idle animations in 8 directions and a full walk cycle. The character assigned to an agent session is deterministically derived from the session ID hash, so the same session always shows the same character.

---

## Configuration

The daemon listens on **port 3001** by default. The UI connects to `http://localhost:3001` and `ws://localhost:3001/ws`.

**Daemon environment variables** (set before starting):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP and WebSocket port |
| `DB_PATH` | `~/.cockpit/cockpit.db` | SQLite database path |

**Audio** — volume settings are persisted to `localStorage` in the browser. Music and SFX can be muted independently from the settings dialog.

**Game state** — player position and camera state persist to `localStorage` across reloads.

**Character selection** — the chosen player character persists to `localStorage`.

---

## Project Status

### v1.0 — Complete

All core operational features are built and verified:

- Daemon core (event bus, SQLite, WebSocket server)
- Claude adapter (HTTP hooks, approval round-trip)
- Codex adapter (app-server JSON-RPC, approval round-trip)
- Session management
- Office Mode (pixel-art map, agents, player character)
- Ops Mode (session list, detail panel)
- Approval inbox with risk classification
- Timeline and replay
- Diff and artifact review
- Memory panel (read/write CLAUDE.md)
- Session history and comparison
- Provider-native session launch (Claude + Codex)
- Session termination controls
- Session chat (daemon-launched sessions)
- Agent face cards in sidebar
- Character picker

### v1.1 — In Progress (91%)

Transforming Office Mode into a polished 2D pixel art game experience:

- [x] Game engine foundation (60 FPS Canvas 2D loop, GameState, Camera)
- [x] Player controls (WASD + arrow keys, smooth movement, direction-aware sprites)
- [x] Map rendering (Wang tileset, 3232×3232 world, multi-map support)
- [x] Walking animations (8-direction walk cycle, 100ms frame timing)
- [x] Collision physics (solid tiles, axis-separated slide)
- [x] Sprite image quality (pixel-perfect rendering at 2× zoom)
- [x] Sidebar design overhaul (space theme, resizable, face portraits)
- [x] NPC spawn positions (safe walkable spawn slots)
- [x] NPC behavior (autonomous movement, approval-pending return, interaction freeze)
- [x] Ambient audio + sound effects (Web Audio API)
- [x] Walking sprites for all 10 characters
- [ ] NPC zone movement (coding → workstation, waiting → meeting room) — Phase 17
- [ ] Save / load system (F5 quick-save, F9 quick-load) — Phase 19
- [ ] HUD overlays (minimap, approval counter, pause menu) — Phase 20
- [ ] Particle effects (dust, sparkles, success/failure) — Phase 21
- [ ] Real PTY terminal streaming (xterm.js in popup) — Phase 30

---

## Roadmap

### Near term (v1.1 completion)

- NPC zone-based movement (coding agents walk to workstation, approval-pending agents walk to meeting room)
- Quick save / load (F5 / F9) with auto-save on key actions
- HUD minimap + approval counter badge + pause menu
- Particle effects (dust on walk, sparkles on interact, burst on session complete/fail)
- Real terminal streaming via PTY (xterm.js embedded in agent popup)

### Future (v2)

- Session labels and tags
- Token, time, and cost counters per session
- Battle mode — send the same task to Claude and Codex simultaneously and compare
- Approval policy rules (auto-approve read-only commands, auto-deny outside repo root)
- Git branch-per-session workflow
- LAN sharing (multi-user viewing of the same daemon state)
- Notification channels (Slack, Discord)
- Plugin SDK for additional provider adapters

---

## Known Limitations

- **Local-first** — all data is stored on your machine; no cloud sync or remote access
- **Desktop-first** — the Office map and game layer are designed for large screens; mobile is unsupported
- **Session launch on Windows** — PTY-backed launch (`node-pty`) requires a native build; ensure `node-gyp` prerequisites are installed
- **External session detection** — externally started sessions (not launched from the UI) attach automatically but do not support message sending or termination
- **Browser autoplay** — ambient music requires a user interaction (click or keypress) before it starts; this is a browser policy constraint
- **Codex app-server** — the Codex integration depends on `codex app-server` being available; check your Codex CLI version if events are not appearing

---

## Troubleshooting

**Session does not appear in the UI**
- Confirm the daemon is running (`pnpm --filter @cockpit/daemon dev`)
- Check that Claude hooks are configured correctly in `~/.claude/settings.json`
- Look at the daemon terminal output for incoming hook requests

**Approvals do not appear**
- Check the WebSocket connection in the browser DevTools (Network → WS tab)
- Confirm the daemon is receiving hook POSTs (daemon terminal should log them)
- Ensure `curl` (not PowerShell's alias) is available on the PATH used by Claude Code on Windows

**UI appears stale or disconnected**
- Reload the browser tab to force a WebSocket reconnect
- The daemon sends a full state snapshot on each new connection

**Sprites or map do not load**
- Run `pnpm sync-map` to copy the latest map assets to `packages/ui/public/maps/`
- Run `pnpm copy-faces` to copy face portraits to `packages/ui/public/sprites/faces/`

**Music does not play**
- Click anywhere on the page — browsers require a user gesture before audio can start
- Check the volume control in the settings dialog (press Escape or click the menu icon)

**`node-pty` build fails on Windows**
- Install Visual Studio Build Tools with the "Desktop development with C++" workload
- Ensure Python is installed and on PATH
- Run `npm rebuild node-pty` in `packages/daemon`

**Port 3001 is already in use**
- Set `PORT=<other>` before starting the daemon and update the UI's `VITE_DAEMON_URL` env var to match

---

## Contributing

Contributions are welcome. The most valuable areas right now:

| Area | What's needed |
|------|--------------|
| NPC zone movement | Phase 17 — lerp agents to workstation/meeting room zones based on session state |
| Save / load system | Phase 19 — F5/F9 quick save, auto-save triggers, JSON export |
| HUD + pause menu | Phase 20 — minimap canvas, approval badge, ESC pause menu |
| Particle effects | Phase 21 — dust, sparkles, session events |
| PTY terminal streaming | Phase 30 — xterm.js integration, node-pty buffering |
| Notification wiring | NOTIF-01/02 — in-app toasts + browser Notification() API |
| Search in history | HIST-01 — mount SearchBar in HistoryPage |
| New provider adapters | Gemini CLI or others |
| Tests | More coverage on daemon approval flows and UI game logic |
| Windows QA | Testing all flows on Windows end-to-end |

**Before contributing**, read the documents in `.planning/` to understand the current project state, constraints, and implementation decisions. The key files are:

- `.planning/PROJECT.md` — core value, decisions, constraints
- `.planning/REQUIREMENTS.md` — full requirements with traceability
- `.planning/ROADMAP.md` — phases and plans with success criteria
- `.planning/STATE.md` — current progress and accumulated context

**Development setup:**

```bash
git clone https://github.com/agent-cockpit/agent-cockpit.git
cd agent-cockpit
pnpm install

# Run all tests
pnpm test

# Type-check everything
pnpm typecheck

# Run daemon in watch mode
pnpm --filter @cockpit/daemon dev

# Run UI in dev mode
pnpm --filter @cockpit/ui dev
```

---

## License

MIT
