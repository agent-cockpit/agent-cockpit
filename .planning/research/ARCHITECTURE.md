# Architecture Research

**Domain:** Local daemon + browser UI devtool (agent control room)
**Researched:** 2026-04-04
**Confidence:** HIGH (Claude hooks: official docs; Codex app-server: official docs; daemon patterns: verified examples)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          PROVIDER LAYER                                  │
│  ┌────────────────────────┐     ┌─────────────────────────────────────┐  │
│  │    Claude Code         │     │    OpenAI Codex                     │  │
│  │  HTTP hooks (per sess) │     │  app-server (stdio/WebSocket)       │  │
│  │  PreToolUse, Perm-     │     │  JSON-RPC 2.0 stream                │  │
│  │  issionRequest,        │     │  thread/turn/item lifecycle         │  │
│  │  SessionStart/Stop,    │     │  approval request/response          │  │
│  │  SubagentStart/Stop…   │     │  JSONL exec fallback                │  │
│  └───────────┬────────────┘     └────────────────┬────────────────────┘  │
└──────────────┼──────────────────────────────────-┼───────────────────────┘
               │ HTTP POST (hook payloads)          │ stdio/JSON-RPC
               ▼                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          DAEMON (Node.js / TypeScript)                   │
│                                                                          │
│  ┌──────────────────────┐   ┌──────────────────────────────────────────┐ │
│  │   Claude Adapter     │   │   Codex Adapter                          │ │
│  │  - HTTP server       │   │  - spawn codex app-server per session    │ │
│  │    (one per session  │   │  - JSON-RPC 2.0 client (stdio transport) │ │
│  │    or shared)        │   │  - JSONL exec fallback parser            │ │
│  │  - normalize hooks   │   │  - normalize item/turn events            │ │
│  │    → NormalizedEvent │   │    → NormalizedEvent                     │ │
│  │  - issue approval    │   │  - relay approval requests               │ │
│  │    responses         │   │  - send approval decisions               │ │
│  └──────────┬───────────┘   └──────────────────────┬───────────────────┘ │
│             │                                      │                     │
│             └──────────────────┬───────────────────┘                     │
│                                ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                    Internal Event Bus (EventEmitter)                 │ │
│  │  - typed NormalizedEvent stream                                      │ │
│  │  - fan-out: SQLite writer, WebSocket broadcaster, approval manager   │ │
│  └─────────┬──────────────────┬───────────────────────────┬────────────┘ │
│            │                  │                           │              │
│            ▼                  ▼                           ▼              │
│  ┌─────────────────┐  ┌───────────────────┐  ┌──────────────────────┐   │
│  │  SQLite Writer  │  │  WebSocket Server │  │  Approval Manager    │   │
│  │  (better-sqlite3│  │  (ws library)     │  │  - pending queue     │   │
│  │  append-only    │  │  - broadcast to   │  │  - correlate by      │   │
│  │  events table)  │  │    all clients    │  │    session+requestId  │   │
│  │  - sessions     │  │  - session sub-   │  │  - decision → adapter│   │
│  │  - approvals    │  │    scriptions     │  │  - timeout handling  │   │
│  │  - memory       │  │  - typed messages │  │                      │   │
│  └─────────────────┘  └───────────────────┘  └──────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
               │                 │
               │ WebSocket       │ REST (reads/queries)
               ▼                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     BROWSER UI (React + Vite + TypeScript)               │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                    WebSocket Client Layer                          │  │
│  │  - single persistent connection to daemon                         │  │
│  │  - typed message envelope parsing                                  │  │
│  │  - reconnect with exponential backoff                              │  │
│  │  - dispatch to global state store                                  │  │
│  └───────────────────────────────────┬────────────────────────────────┘  │
│                                      ▼                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                    Global State Store (Zustand)                     │ │
│  │  - sessions map (id → SessionState)                                 │ │
│  │  - approval queue                                                   │ │
│  │  - active mode (office | ops)                                       │ │
│  │  - selected session                                                 │ │
│  └───────────────────────────────────┬─────────────────────────────────┘ │
│                                      │                                   │
│            ┌─────────────────────────┼──────────────────────┐            │
│            ▼                         ▼                      ▼            │
│  ┌─────────────────┐  ┌──────────────────────────┐  ┌──────────────────┐ │
│  │  Office Mode    │  │  Ops Mode                │  │  Approval Inbox  │ │
│  │  (Pixi.js v8 / │  │  - Session list panel    │  │  - approval queue│ │
│  │  @pixi/react)  │  │  - Detail panel          │  │  - approve/deny  │ │
│  │  - agent cards │  │  - Timeline/replay       │  │  - risk display  │ │
│  │  - animations  │  │  - Diff viewer (Monaco)  │  │                  │ │
│  │  - click→ops   │  │  - Memory panel          │  │                  │ │
│  └─────────────────┘  └──────────────────────────┘  └──────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Claude Adapter | Receives HTTP hook POSTs from Claude Code, issues HTTP approval responses, normalizes hook payloads to NormalizedEvent | Express/Fastify HTTP server per session or shared with session discriminator |
| Codex Adapter | Spawns and manages `codex app-server` child processes per session, speaks JSON-RPC 2.0 over stdio, relays approval requests and decisions | Node.js child_process spawn, readline for JSON-RPC stream |
| Internal Event Bus | Fan-outs NormalizedEvents to all consumers (SQLite, WebSocket, approval manager); decouples adapters from sinks | Node.js EventEmitter or tiny typed wrapper |
| SQLite Writer | Appends all events to append-only events table; writes session/approval/memory records | better-sqlite3 (synchronous, fastest Node.js SQLite binding) |
| WebSocket Server | Broadcasts typed messages to all connected browser clients; handles session subscriptions | ws library (low-level, minimal overhead) |
| Approval Manager | Holds pending approval requests in-memory; correlates incoming browser decisions to waiting adapter callbacks; enforces timeouts | Map<requestId, PendingApproval> with Promise resolution |
| WebSocket Client Layer | Browser-side: single WS connection, typed message dispatch to Zustand store, reconnect logic | Custom hook wrapping native WebSocket |
| Global State Store | Single source of truth for all UI state; updated by WS events | Zustand (lightweight, no boilerplate, works well with React) |
| Office Mode Canvas | Real-time agent visualization; updates from state store subscriptions | Pixi.js v8 via @pixi/react (official, supports React 19 + Pixi v8) |
| Ops Mode Panels | Session detail, timeline scrubbing, diff viewing, memory editing | React components; Monaco Editor for diff/code |
| Approval Inbox | Aggregated approval queue UI; sends decisions via WS back to daemon | React component with Zustand subscription |

## Recommended Project Structure

```
agent-cockpit/
├── packages/
│   ├── daemon/                  # Node.js TypeScript daemon
│   │   ├── src/
│   │   │   ├── adapters/
│   │   │   │   ├── claude/      # Claude hook HTTP server + normalizer
│   │   │   │   └── codex/       # Codex app-server process manager + normalizer
│   │   │   ├── core/
│   │   │   │   ├── event-bus.ts      # Typed EventEmitter wrapper
│   │   │   │   ├── event-model.ts    # NormalizedEvent types
│   │   │   │   └── session-registry.ts  # Active session tracking
│   │   │   ├── persistence/
│   │   │   │   ├── db.ts             # better-sqlite3 setup, migrations
│   │   │   │   ├── schema.sql        # DDL for events, sessions, approvals, memory
│   │   │   │   └── queries.ts        # Typed query functions
│   │   │   ├── approvals/
│   │   │   │   └── approval-manager.ts  # Pending queue, correlation, timeout
│   │   │   ├── websocket/
│   │   │   │   └── ws-server.ts      # ws server, broadcast helpers, message typing
│   │   │   └── main.ts              # Entrypoint: wires everything together
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── ui/                      # React browser UI
│       ├── src/
│       │   ├── ws/
│       │   │   └── use-ws.ts         # WebSocket client hook, reconnect
│       │   ├── store/
│       │   │   └── session-store.ts  # Zustand store
│       │   ├── features/
│       │   │   ├── office/           # Pixi.js canvas mode
│       │   │   ├── ops/              # Session list, timeline, diff, memory
│       │   │   └── approvals/        # Approval inbox
│       │   ├── components/           # Shared UI primitives
│       │   └── main.tsx
│       ├── vite.config.ts
│       └── package.json
└── package.json                  # Monorepo root (pnpm workspaces)
```

### Structure Rationale

- **packages/daemon vs packages/ui:** Hard boundary between daemon and UI processes; shared types (NormalizedEvent, WS message schemas) can live in a third `packages/shared` package if they grow complex.
- **adapters/ subdirectory per provider:** Each provider is a self-contained module; adding a new provider (e.g., Gemini CLI) means adding a new adapter folder without touching core.
- **core/ for event-bus and event-model:** These are the central contracts. Everything depends on them; they depend on nothing else in the daemon.
- **persistence/ isolated from adapters:** Adapters emit events; the SQLite writer consumes events. Adapters never call persistence directly — this keeps replay and testing clean.

## Architectural Patterns

### Pattern 1: HTTP Hook Server (Claude Adapter)

**What:** Claude Code fires HTTP POST requests to a local endpoint at each lifecycle event. The daemon runs a small HTTP server that receives these, validates the payload, normalizes to NormalizedEvent, publishes to the event bus, and returns a JSON response (approval decision or empty ack).

**When to use:** The definitive integration path for Claude Code. Claude Code's HTTP hooks are the only structured, reliable lifecycle surface — transcript observation is fragile and deprecated for this use case.

**Trade-offs:** Each Claude session must be configured with the hook URL (can be automated via `~/.claude/settings.json` or project-level `.claude/settings.json`). The HTTP server must be running before Claude Code starts. Session multiplexing requires the hook URL to carry a session identifier or a shared endpoint that discriminates by `session_id` in the payload.

**Example:**
```typescript
// Claude Adapter: HTTP server receiving PreToolUse hook
app.post('/hooks/claude', async (req, res) => {
  const payload: ClaudeHookPayload = req.body;
  const normalized = normalizeClaudeEvent(payload);
  eventBus.emit('event', normalized);

  if (payload.hook_event_name === 'PreToolUse') {
    const decision = await approvalManager.requestDecision({
      sessionId: payload.session_id,
      requestId: payload.tool_use_id,
      tool: payload.tool_name,
      input: payload.tool_input,
    });
    // Return structured JSON to Claude Code
    res.json({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision.allow ? 'allow' : 'deny',
        permissionDecisionReason: decision.reason,
      }
    });
  } else {
    res.json({});
  }
});
```

### Pattern 2: JSON-RPC 2.0 Child Process (Codex Adapter)

**What:** The daemon spawns `codex app-server` as a child process per session. Communication is via stdio using newline-delimited JSON-RPC 2.0. The adapter sends requests (thread/start, approval responses) and reads a continuous stream of notifications (item/started, item/commandExecution/requestApproval, turn/completed, etc.).

**When to use:** The definitive integration path for Codex. The app-server is designed explicitly for rich clients — it provides streaming, approvals, and session history in a single interface.

**Trade-offs:** One child process per active Codex session means process management overhead. The WebSocket transport (experimental) is an alternative that avoids stdio line-by-line parsing but introduces bounded queue limits. Stdio is safer for v1.

**Example:**
```typescript
// Codex Adapter: spawn and read JSON-RPC stream
const child = spawn('codex', ['app-server'], { stdio: ['pipe', 'pipe', 'inherit'] });
const rl = readline.createInterface({ input: child.stdout! });

rl.on('line', (line) => {
  const msg: JsonRpcMessage = JSON.parse(line);
  if (msg.method === 'item/commandExecution/requestApproval') {
    // Forward to approval manager, then send response
    approvalManager.requestDecision(msg.params).then((decision) => {
      child.stdin!.write(JSON.stringify({
        id: msg.id,
        result: { behavior: decision.allow ? 'accept' : 'decline' }
      }) + '\n');
    });
  } else {
    const normalized = normalizeCodexEvent(msg);
    if (normalized) eventBus.emit('event', normalized);
  }
});
```

### Pattern 3: Typed WebSocket Message Envelope

**What:** All WebSocket messages (both daemon→browser and browser→daemon) use a typed envelope with a `type` discriminator field. The browser dispatches on `type` to update the Zustand store or trigger side effects. This avoids schema drift and makes the protocol self-documenting.

**When to use:** Always. Untyped WS messages become unmanageable as the protocol grows.

**Trade-offs:** Requires maintaining a shared type definition. Recommend a `packages/shared` package with WsMessage union type shared between daemon and UI.

**Example:**
```typescript
// Shared message types
type DaemonMessage =
  | { type: 'session:updated'; payload: SessionState }
  | { type: 'event:new'; payload: NormalizedEvent }
  | { type: 'approval:request'; payload: ApprovalRequest }
  | { type: 'approval:resolved'; payload: ApprovalResolution };

type ClientMessage =
  | { type: 'approval:decision'; payload: ApprovalDecision }
  | { type: 'session:subscribe'; sessionId: string };

// Browser dispatch
ws.onmessage = (e) => {
  const msg: DaemonMessage = JSON.parse(e.data);
  useSessionStore.getState().handleDaemonMessage(msg);
};
```

## Data Flow

### Primary Event Flow (Provider → SQLite → Browser)

```
Claude Code fires PreToolUse hook (HTTP POST)
    │
    ▼
Claude Adapter (HTTP server)
    │ normalizeClaudeEvent()
    ▼
NormalizedEvent { sessionId, type, timestamp, provider, payload }
    │
    ▼
Internal Event Bus (EventEmitter)
    │
    ├──► SQLite Writer
    │      INSERT INTO events (session_id, type, payload, ts) VALUES (...)
    │      [append-only; never UPDATE]
    │
    ├──► WebSocket Server
    │      broadcast({ type: 'event:new', payload: normalizedEvent })
    │      → all connected browser clients
    │
    └──► Approval Manager (if event.type === 'approval:request')
           → hold Promise pending browser decision
```

### Approval Flow (End-to-End)

```
[Provider]                [Daemon]                    [Browser UI]
    │                        │                              │
    │── hook/approval ──────►│                              │
    │   (PreToolUse or       │── approval:request ─────────►│
    │    requestApproval)    │   (WS broadcast)             │
    │                        │                              │
    │                        │     [Approval Inbox shows    │
    │                        │      modal with tool/risk]   │
    │                        │                              │
    │                        │◄── approval:decision ────────│
    │                        │    (WS client message)       │
    │                        │                              │
    │                        │  Approval Manager resolves   │
    │                        │  pending Promise             │
    │                        │                              │
    │◄── HTTP response ──────│  (Claude: JSON deny/allow)   │
    │   OR                   │  (Codex: JSON-RPC result)    │
    │◄── JSON-RPC result ────│                              │
    │                        │                              │
    │                        │── approval:resolved ─────────►│
    │                        │   (WS broadcast, UI update)  │
    │                        │                              │
    │                        │  SQLite: INSERT approval     │
    │                        │  record with decision        │
```

Key constraint: Claude Code's HTTP hook will time out if the daemon does not respond within the configured `timeout` (default 30s). The approval manager must enforce a matching deadline and auto-deny on timeout to prevent Claude from stalling indefinitely.

### State Reconstruction Flow (Browser Refresh / Reconnect)

```
Browser connects WebSocket
    │
    ▼
Daemon sends current snapshot:
  { type: 'init', payload: { sessions: SessionState[], pendingApprovals: ApprovalRequest[] } }
    │
    ▼
Zustand store hydrates from snapshot
    │
    ▼
Subsequent WS events are incremental patches
```

This avoids REST polling on reconnect. The daemon keeps an in-memory projection of current session states (derived from SQLite on startup, then updated from the event bus).

### Timeline Replay Flow

```
Browser requests session timeline:
  REST GET /api/sessions/:id/events?from=0&to=<timestamp>
    │
    ▼
Daemon queries SQLite:
  SELECT * FROM events WHERE session_id = ? ORDER BY ts ASC
    │
    ▼
Returns ordered NormalizedEvent array
    │
    ▼
UI renders scrubable timeline, replays state by
folding events: events.reduce(applyEvent, initialState)
```

## Suggested Build Order

The dependency graph dictates the following order. Each phase requires the previous to be stable.

```
Phase 1: Daemon Core + Unified Event Model
  - Define NormalizedEvent TypeScript types (all later work depends on this contract)
  - Internal event bus (EventEmitter wrapper)
  - SQLite schema + append-only writer
  - Session registry (in-memory, seeded from SQLite on start)
  - WebSocket server (ws library, typed message envelopes)
  Deliverable: daemon that can receive raw events and broadcast them

Phase 2: Claude Adapter
  - HTTP server receiving hook payloads
  - Normalize all Claude hook types → NormalizedEvent
  - Approval request/response round-trip (PreToolUse + PermissionRequest)
  - Stub browser approval response (auto-allow) to unblock testing
  Deliverable: Claude sessions visible in daemon with real events

Phase 3: Browser UI Shell + Real-Time Feed
  - Vite + React + Zustand scaffolding
  - WebSocket client hook (reconnect, typed dispatch)
  - Session list view (Ops mode skeleton) fed from WS events
  - No Office mode yet — validate data flow first
  Deliverable: browser shows live Claude session events

Phase 4: Approval Inbox UI
  - Approval inbox component (pending queue from Zustand)
  - Approve/deny actions sending WS client messages
  - Daemon Approval Manager correlating decisions → Claude HTTP response
  - Persist approval records to SQLite
  Deliverable: full approval round-trip, end-to-end

Phase 5: Codex Adapter
  - child_process spawn of codex app-server
  - JSON-RPC 2.0 client (readline over stdio)
  - Normalize Codex item/turn events → NormalizedEvent
  - Codex approval request/response (item/commandExecution/requestApproval)
  Deliverable: Codex sessions in same UI as Claude sessions

Phase 6: Ops Mode Panels
  - Session detail panel
  - Timeline/replay panel (REST query + fold)
  - File diff panel (Monaco diff viewer)
  - Memory panel (read/edit CLAUDE.md and Codex memory)
  Deliverable: full operational control plane

Phase 7: Office Mode
  - Pixi.js v8 + @pixi/react canvas
  - Agent card sprites driven by session state from Zustand
  - Animation state machine (idle, working, approval-pending, done, failed)
  - Click-through to Ops mode session
  Deliverable: spatial visualization layer
```

Office mode is last because it has no blockers on approval flow or persistence — it is pure display that reads from Zustand. Building it last means the data model is already proven.

## Anti-Patterns

### Anti-Pattern 1: Transcript Observation Instead of Hooks

**What people do:** Parse Claude Code's `.transcript.jsonl` or `~/.claude/projects/*.json` files to infer session state by watching file changes.

**Why it's wrong:** Heuristic and fragile. Event boundaries are ambiguous. Structured tool inputs are not exposed. Approval responses cannot be injected. The file format is undocumented and changes without notice. Multiple concurrent readers on the same file cause race conditions.

**Do this instead:** Use Claude Code HTTP hooks. They provide structured JSON payloads, block until a response is returned (enabling approval), and are documented with stable schemas.

### Anti-Pattern 2: Polling SQLite from the Browser

**What people do:** Browser makes REST GET requests on an interval to check for new events.

**Why it's wrong:** Adds latency to approval flow (approval modal appears up to N seconds late). Creates unnecessary load. Makes approval timeout handling unreliable.

**Do this instead:** Push all new events over the persistent WebSocket connection. REST is appropriate only for historical queries (timeline replay, search).

### Anti-Pattern 3: One WebSocket Connection Per Session

**What people do:** Open a separate WS connection for each monitored agent session.

**Why it's wrong:** At 10+ concurrent sessions, connection management explodes. Browser enforces per-origin connection limits. Reconnect logic multiplies.

**Do this instead:** Single multiplexed WebSocket connection. Events carry `sessionId`. Browser filters by session in the Zustand store.

### Anti-Pattern 4: Synchronous SQLite Writes in the Event Path

**What people do:** Call `db.run(INSERT ...)` synchronously inside the HTTP hook handler before returning a response to Claude Code.

**Why it's wrong:** Write contention under multiple concurrent sessions slows hook response times, risking Claude Code timeout (default 30s, but latency still matters for UX).

**Do this instead:** The SQLite writer consumes from the event bus asynchronously. The HTTP hook handler returns as soon as it has the approval decision — the write happens in parallel.

### Anti-Pattern 5: Tight Coupling Between Adapter and Approval UI Logic

**What people do:** Claude adapter directly calls browser notification logic or holds references to UI state.

**Why it's wrong:** Makes testing impossible. Approval logic becomes entangled with transport details.

**Do this instead:** Adapters emit normalized events. Approval Manager is the single place that holds pending decisions and resolves them. Adapters await the Approval Manager's Promise; they never know about WebSocket or UI.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Claude Code | HTTP hook target (daemon acts as server) | Configure via `~/.claude/settings.json` or project `.claude/settings.json`. HTTP hooks added in late 2024/2025; all major Claude Code versions support them. Timeout default: 30s. |
| Codex app-server | Child process (stdio JSON-RPC 2.0) or WebSocket (experimental) | Use stdio for v1 stability. Spawn one process per active Codex session. Initialize handshake required before any method calls. |
| CLAUDE.md / auto memory | File read/write (fs module) | Read on session start, watch for changes, expose via memory panel. Writes are direct file mutations — no API. |
| Codex memory (agent_instructions) | JSON config file or Codex API if exposed | Check Codex documentation for memory surface; may vary by version. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Adapter → Event Bus | `eventBus.emit('event', normalizedEvent)` | Fire-and-forget from adapter perspective. No return value. |
| Event Bus → SQLite Writer | EventEmitter subscription | Synchronous subscription, async write. Use WAL mode in SQLite for concurrent readers. |
| Event Bus → WebSocket Server | EventEmitter subscription | Broadcast to all connected clients. Filter by sessionId subscriptions on client side. |
| Approval Manager → Adapter | `Promise<ApprovalDecision>` | Adapter `await`s decision. Manager resolves/rejects. Timeout auto-rejects. |
| WebSocket Server → Approval Manager | `approvalManager.decide(requestId, decision)` | WS server calls this when browser sends `approval:decision` message. |
| Browser WS Client → Zustand | Direct store dispatch | No action creators needed for this size; call `store.getState().applyEvent(msg)` directly. |
| Office Mode → Zustand | Zustand subscription | Pixi.js tick loop reads session states from store snapshot; no direct WS dependency. |

## Scaling Considerations

This is a local-first single-user tool. Scaling considerations apply within that constraint (i.e., many concurrent local agent sessions, not distributed users).

| Concern | At 5 sessions | At 20 sessions | At 50+ sessions |
|---------|---------------|----------------|-----------------|
| SQLite write throughput | Fine, synchronous is fast | Enable WAL mode, batch writes within 10ms windows | Batch writes; consider event buffering |
| WebSocket broadcast | Fine | Fine | Consider per-session subscription filtering before broadcast |
| Codex child processes | 5 processes, minimal | 20 processes, watch memory | Implement process pooling or lazy spawn |
| UI rendering (Zustand → React) | Fine | Throttle Zustand updates to ~30fps in Office mode | Use Pixi.js ticker loop instead of React re-renders for canvas |
| SQLite query latency (timeline) | Fast (<5ms) | Still fast | Add index on (session_id, ts); use pagination |

## Sources

- [Claude Code Hooks Reference — Official Anthropic Docs](https://code.claude.com/docs/en/hooks) — HIGH confidence (official docs, current)
- [Codex App-Server — Official OpenAI Docs](https://developers.openai.com/codex/app-server) — HIGH confidence (official docs, current)
- [Claudeck: Browser UI for Claude Code (architecture deep-dive)](https://dev.to/hamed_farag/i-built-a-browser-ui-for-claude-code-heres-why-4959) — MEDIUM confidence (real-world implementation, verified stack: Express + ws + better-sqlite3)
- [Claude Code Hooks Complete Guide 2026](https://smartscope.blog/en/generative-ai/claude/claude-code-hooks-guide/) — MEDIUM confidence (community, corroborates official docs)
- [Event Sourcing with SQLite: Append-Only Design](https://www.sqliteforum.com/p/event-sourcing-with-sqlite) — MEDIUM confidence (pattern guidance)
- [WebSocket Architecture Best Practices](https://ably.com/topic/websocket-architecture-best-practices) — MEDIUM confidence (industry reference)
- [PixiJS React — Official Library](https://react.pixijs.io/) — HIGH confidence (official @pixi/react, supports React 19 + Pixi v8)

---
*Architecture research for: Agent Mission Control (local daemon + browser UI devtool)*
*Researched: 2026-04-04*
