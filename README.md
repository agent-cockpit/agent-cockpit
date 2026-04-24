# Agent Cockpit

Agent Cockpit is a local-first control room for running multiple coding agents at the same time. It turns Claude Code and Codex sessions into something you can actually see, manage, approve, and review, with a pixel-art office on top and an operational control plane underneath.

The goal is to replace terminal sprawl with a single interface for visibility, approvals, diffs, memory, history, and live agent status.

## Table of Contents

- [The Idea](#the-idea)
- [Core Features](#core-features)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Stack](#stack)
- [Requirements](#requirements)
- [Installation](#installation)
- [Available Scripts](#available-scripts)
- [Usage](#usage)
- [Project Status](#project-status)
- [Roadmap](#roadmap)
- [Known Limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## The Idea

If you run several agent sessions at once, the hard part is not launching them. The hard part is knowing:

- what each agent is doing right now
- which session needs your attention
- which approval is safe to grant
- what changed in the repository
- how to find the session again later

Agent Cockpit solves that by combining a visual office map with a structured operations dashboard.

## Core Features

### Office Mode

- Each active session appears as a character in a pixel-art office.
- Agent state is reflected visually through animation and placement.
- Clicking an agent opens its detailed session view.
- The map acts as the main spatial layer of the product.
- The player also has a character on the map.
- The experience is designed to feel like a game, not just a dashboard.

### Ops Mode

- Session list with live status.
- Detailed session view.
- Approval inbox for actions that need review.
- Timeline for replaying session activity.
- Diff viewer for changed files.
- Memory panel for project instructions and notes.
- Artifact and history surfaces for deeper inspection.

### Unified Approvals

- Approvals from Claude Code and Codex appear in one queue.
- Each request can be reviewed with context.
- Support for approve once, deny once, and always allow within a session.
- Risk context helps you make faster and safer decisions.
- Decisions are stored locally.

### Timeline and Replay

- Events are shown in chronological order.
- You can inspect what happened during a session.
- Approval events, tool calls, file changes, and completion events are all visible.
- Useful for debugging, reviewing, and understanding agent behavior.

### Diff and Artifact Review

- See what files changed during a session.
- Inspect diffs per file.
- Review session summaries.
- Useful for auditing agent output before you merge or accept it.

### Memory Panel

- View and edit project memory.
- Keep persistent instructions and conventions in one place.
- Read and update knowledge that agents should remember.
- Support for normalized memory surfaces across providers.

### Session History

- Reopen old sessions.
- Inspect prior work after a session has ended.
- Search and compare historical runs.
- Useful when you need to answer questions like what happened yesterday on a repo.

## How It Works

Agent Cockpit has three main layers:

1. Provider layer
	Claude Code and Codex emit events and approvals through their native integration surfaces.

2. Daemon layer
	A local daemon normalizes provider events, stores them in SQLite, and broadcasts live updates over WebSocket.

3. Browser UI
	The React interface consumes live events and updates the office map, operational panels, and session detail views.

In practice, the flow looks like this:

- an agent performs an action
- the daemon receives the event
- the event is normalized and persisted locally
- the browser updates in real time
- you approve, inspect, or redirect the session

## Architecture

The repository is organized as a monorepo with three primary packages:

- `packages/daemon`: local TypeScript daemon
- `packages/ui`: React and Vite browser UI
- `packages/shared`: shared event types and validation

Supporting folders include:

- `assets`: sprites, maps, and visual resources
- `scripts`: asset processing and validation utilities
- `.planning`: product vision, requirements, roadmap, and current state

## Stack

- TypeScript
- Node.js
- better-sqlite3
- ws
- Zod
- React
- Vite
- Zustand
- Radix UI
- Tailwind CSS
- Canvas 2D for the visual layer
- sharp for sprite and asset processing

## Requirements

- Node.js 22 or newer
- pnpm
- Claude Code CLI configured
- Codex CLI configured
- Supported desktop OS: Linux, macOS, and Windows
- A modern desktop browser
- Local filesystem access for the workspace and session data

## Installation

### 1. Install Claude Code CLI

**Mac / Linux:**

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://claude.ai/install.ps1 | iex
```

**Or via npm (all OS):**

```bash
npm install -g @anthropic-ai/claude-code
claude auth login
```

### 2. Install Codex CLI

```bash
npm install -g @openai/codex
```

Set your API key:

```bash
export OPENAI_API_KEY=sk-...        # Mac / Linux
$env:OPENAI_API_KEY = "sk-..."      # Windows PowerShell
```

### 3. Clone and run Agent Cockpit

```bash
git clone https://github.com/agent-cockpit/agent-cockpit.git
cd agent-cockpit
pnpm install
pnpm build
```

Start the daemon (terminal 1):

```bash
pnpm --filter @cockpit/daemon dev
```

Start the UI (terminal 2):

```bash
pnpm --filter @cockpit/ui dev
```

On Windows, make sure both `claude` and `codex` are available on `PATH` in the same shell where you start the daemon.

## Available Scripts

Root scripts:

- `pnpm test`
- `pnpm build`
- `pnpm typecheck`
- `pnpm sync-map`
- `pnpm copy-faces`

Package scripts:

- `packages/daemon`: `start`, `dev`, `test`, `typecheck`
- `packages/ui`: `dev`, `build`, `preview`, `test`, `typecheck`
- `packages/shared`: `test`, `typecheck`

## Usage

1. Open the UI in your browser.
2. Connect or launch Claude Code and Codex sessions.
3. Watch the agents appear in the office.
4. Click an agent to open its details.
5. Review approvals, timeline, diff, and memory.
6. Use history to revisit older sessions.

## Project Status

The project already covers the operational and visual foundations of the control room, including:

- Office Mode
- Ops Mode
- unified approvals
- memory
- timeline
- diff review
- session history

The current direction is to make the experience feel more like a polished game while preserving its value as a serious control layer for multiple agents.

## Roadmap

Planned directions include:

- more natural movement and animation
- state-driven NPC behavior
- ambient audio and sound effects
- save and load support
- richer notifications
- stronger search across history
- support for additional providers and session types

## Known Limitations

- The system is local-first by design.
- Some flows depend on correct integration with external provider tools.
- The visual layer is desktop-first.
- Game-like behavior and navigation are still evolving alongside the roadmap.

## Troubleshooting

- If a session does not appear, confirm the daemon is running.
- If approvals do not show up, check the WebSocket connection and provider configuration.
- If the UI looks stale, restart the browser client to force a reconnect.
- If sprites or the map do not load, verify the public assets and sync process.

## Contributing

Contributions are welcome, especially in these areas:

- new provider integrations
- approval UX
- Office Mode polish
- replay and diffs
- search and history
- audio, movement, and interaction
- tests and daemon robustness

Before contributing, read the documents in `.planning` to understand the current project state, constraints, and implementation decisions.

## License

MIT
