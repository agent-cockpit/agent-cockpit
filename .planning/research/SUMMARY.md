# Project Research Summary

**Project:** Agent Mission Control (agent-cockpit)
**Domain:** Local daemon + browser devtool — multi-provider AI agent control room
**Researched:** 2026-04-04
**Confidence:** HIGH

## Executive Summary

Agent Mission Control is a local-first browser devtool that monitors, visualizes, and controls AI coding agents (Claude Code and OpenAI Codex) running on the developer's machine. The dominant pattern for this class of tool is a Node.js daemon that ingests provider-specific lifecycle events, normalizes them into a unified event model, persists them to SQLite in append-only fashion, and streams them over a single multiplexed WebSocket connection to a React/Vite browser UI. The daemon is the critical path: every UI feature depends on it. No existing competitor (Pixel Agents, agents-observe, agentsview, agent-flow) combines approvals + memory management + diff review + multi-provider support in one browser-first tool — this is the market gap Agent Mission Control fills.

The recommended approach builds on three non-negotiable decisions: (1) define the canonical `AgentEvent` schema with a `schemaVersion` field before any adapter work begins — schema migration after events are persisted is the highest-cost rewrite trigger in this domain; (2) implement approval timeout and expiry logic in the same phase as the first approval flow, not as a follow-up — the approval deadlock pattern is the most common show-stopper in agent control-plane tools; (3) decouple the Pixi.js Office mode render loop from React state updates via a `useRef` event buffer and `PIXI.Ticker` — coupling these collapses frame rate at demo time when it matters most. All three of these are Phase 1 or Phase 2 concerns, not optimizations.

The primary risks are schema ossification (deferred normalization leading to costly refactors), approval deadlocks (missing timeout logic that hangs agents), and WebSocket reconnect state desync (missing sequence numbers and catch-up protocol). Each has a clear prevention strategy outlined in PITFALLS.md and must be addressed in the first two phases. Secondary risks — SQLite WAL checkpoint starvation, provider adapter brittleness, and Office mode performance collapse — are real but recoverable with lower refactor cost if caught early.

## Key Findings

### Recommended Stack

The daemon runs on Node.js 22 LTS with TypeScript 6 and `tsx` for zero-config ESM watch mode. SQLite persistence is handled by `better-sqlite3` (synchronous, fastest Node SQLite binding) paired with `drizzle-orm` for type-safe schema-as-code and migration generation. WebSocket transport uses the raw `ws` library — Socket.IO's rooms, namespaces, and fallback transports are irrelevant overhead for a single-browser-client local daemon. Incoming hook payloads and JSONL events are validated at the adapter boundary with `zod` v4 (14x faster than v3), sharing inferred TypeScript types with the frontend via a `packages/shared` monorepo package. File watching (CLAUDE.md, memory files) uses `chokidar` v5 (ESM-only, Node 20+).

The browser UI is Vite 8 + React 19 + TypeScript 6. State management is Zustand 5 — the critical advantage over Jotai or TanStack Query is that Zustand stores are vanilla JS objects writable from WebSocket message handlers outside React's render cycle. UI components use Tailwind CSS v4 + shadcn/ui for dense devtool panels. Office mode visualization uses PixiJS v8 + `@pixi/react` v8 (requires React 19, officially supports WebGL2 and WebGPU). The diff panel uses `react-diff-view` for read-only session diffs and `@monaco-editor/react` for the editable Memory panel (CLAUDE.md).

**Core technologies:**
- `ws` 8.20.x: WebSocket server — minimal, zero-dependency, 50K+ connections/process; no Socket.IO overhead
- `better-sqlite3` 12.8.x + `drizzle-orm` 0.45.x: SQLite layer — synchronous API correct for single-writer daemon, schema-as-code migrations
- `tsx` 4.21.x: TypeScript daemon runner — replaces ts-node + nodemon, zero-config ESM, `--watch` mode
- `zod` 4.3.x: Runtime schema validation at adapter boundary — schemas shared with frontend as TypeScript types
- `chokidar` 5.0.x: Filesystem watcher for memory files — ESM-only, requires Node 20+
- `zustand` 5.0.x: Browser state — writable from WebSocket handlers outside React, selective subscriptions prevent jank
- `pixi.js` 8.17.x + `@pixi/react` 8.0.x: Office mode canvas — WebGL2/WebGPU, pixel-perfect sprites, React 19 required
- `react-diff-view` 3.3.x: Read-only diff panel — 95% lighter than Monaco DiffEditor for this use case
- `@monaco-editor/react` 4.7.x: Memory panel editor — use only where interactive editing is needed

### Expected Features

The competitive landscape is fragmented: all existing tools are Claude-only (Codex is on roadmaps, not shipped), none combine approvals + memory + diff review, and VS Code-bound tools (Pixel Agents) miss the browser-first audience. Agent Mission Control's MVP must validate two core value propositions: unified approval control across providers, and multi-session visibility with memory management. Office mode is included in the MVP because it is the demo-able differentiator that drove 41K Pixel Agents installs and Fast Company coverage — it is the "creator hook" that makes the tool shareable.

**Must have (table stakes):**
- Live session list with real-time status indicators — every monitoring tool has this; absence feels broken
- Real-time event stream per session — ground-truth hook-based (not heuristic polling)
- Session persistence across browser refresh — data loss on refresh is a show-stopper
- Approval inbox (unified, multi-provider) — the core value prop; absent makes the tool read-only
- Risk classification on approvals — shell/file/network/MCP labeling with "why risky" hint
- File diff view per session — what did the agent change
- Desktop/browser notifications — users step away; approval-needed and session-complete signals
- Local-first privacy — daemon binds to localhost; no telemetry; local SQLite only

**Should have (competitive differentiators):**
- Approve-once / always-allow / deny-once decision modes — granular trust vocabulary
- Memory panel (read + edit CLAUDE.md + approve agent-suggested notes) — no competitor surfaces this
- Office mode (pixel-art spatial visualization) — demo-able, shareable; differentiator from pure Ops tools
- Provider-normalized memory view (CLAUDE.md vs AGENTS.md unified surface)
- Sub-agent hierarchy visualization — expected once multi-agent Claude Code usage grows
- Keyboard navigation — developer tool audience expects vim-style shortcuts

**Add after validation (v1.x):**
- Timeline/replay with scrubbing — requires stable event schema first
- Session comparison view — add when users report wanting to compare provider outputs
- Full-text search across sessions — useful after >20 sessions accumulate

**Defer (v2+):**
- Approval macro / policy rules engine — session-scoped "always allow" must be validated first
- LAN / remote multi-user access — introduces auth complexity; solo-dev value must be proven first
- Cost / token tracking — API data reliability insufficient in current provider versions
- Cloud sync / backup — contradicts local-first promise until post-PMF

### Architecture Approach

The system has three layers: a Provider Layer (Claude Code firing HTTP hooks per session; Codex running as a spawned child process per session via JSON-RPC 2.0 over stdio), a Daemon Layer (two provider adapters that normalize events into a unified `NormalizedEvent` type, an internal EventEmitter bus that fan-outs to an append-only SQLite writer, a WebSocket broadcast server, and an Approval Manager with Promise-based correlation), and a Browser Layer (single multiplexed WebSocket connection dispatching to a Zustand store, feeding Office Mode canvas and Ops Mode panels). All WebSocket messages use a typed discriminated-union envelope (`{ type, payload }`) defined in a `packages/shared` package — untyped WS messages become unmanageable as the protocol grows. The browser reconstructs full state on connect via an `init` snapshot message from the daemon, then receives incremental events — no REST polling required except for historical timeline queries.

**Major components:**
1. Claude Adapter — HTTP server receiving hook POSTs, normalizing to `NormalizedEvent`, issuing approval responses; configured via `~/.claude/settings.json`
2. Codex Adapter — spawns `codex app-server` per session as a child process, speaks JSON-RPC 2.0 over stdio (note: Codex uses "JSON-RPC lite" without the `"jsonrpc": "2.0"` header — use a lenient parser, not a strict JSON-RPC library)
3. Internal Event Bus — typed EventEmitter wrapper; decouples adapters from all sinks (SQLite, WebSocket, Approval Manager)
4. SQLite Writer — append-only events table via `better-sqlite3`; WAL mode enabled; checkpoint scheduled every 60s
5. Approval Manager — `Map<requestId, PendingApproval>` with Promise resolution; enforces per-approval timeout with configurable `onTimeout` policy; auto-denies destructive actions on expiry
6. WebSocket Server — single multiplexed connection; carries `sessionId` on all events; browsers filter client-side via Zustand
7. Zustand Store — single source of truth for all UI state; updated from WebSocket message handlers outside React render cycle
8. Office Mode Canvas — PixiJS v8 via `@pixi/react`; event buffer in `useRef` drained per `PIXI.Ticker` frame; decoupled from React state updates
9. Ops Mode Panels — Session detail, timeline/replay (REST + event fold), diff viewer, memory panel

### Critical Pitfalls

1. **Premature event schema (Phase 1)** — Define the canonical `AgentEvent` with `schemaVersion`, `sequenceNumber`, `provider` enum, and a `raw` opaque blob before writing any adapter. Schema migration after events are persisted and the timeline UI is built on top is 3-5x the upfront design cost.

2. **Approval deadlock (Phase 2)** — Every approval record must carry `requestedAt`, `timeoutAt`, and an `onTimeout` policy. A background poller must expire stale approvals and emit a `approval_expired` event. Ship this with the first approval implementation — retrofitting timeout logic requires touching the DB schema, approval manager, and UI simultaneously.

3. **WebSocket reconnect state desync (Phase 1)** — Events must carry a monotonic `sequenceNumber`. The client `subscribe` message must include `lastSeenSequence`. On reconnect, the daemon replays events with `sequenceNumber > lastSeenSequence` before resuming live streaming. Without this, the UI shows stale state after daemon restarts.

4. **Office mode performance collapse (Phase 7)** — Never pass WebSocket events directly into React state when driving the Pixi scene graph. Buffer incoming events in `useRef`, drain the buffer in `PIXI.Ticker`, and update Pixi objects directly. Reserve React state for non-canvas DOM (session list, approval badge counts). Frame rate must stay above 45fps with 10 concurrent sessions.

5. **Provider adapter brittleness (Phase 2 and Phase 5)** — Validate all provider payloads with `zod` at the adapter boundary. Emit `provider_parse_error` events (not crashes) on validation failure. Write fixture-based adapter tests against captured provider output at known versions. Codex-specific: `rate_limits` is always `None` in exec mode (issue #14728); use app-server mode for production.

## Implications for Roadmap

Based on the dependency graph in ARCHITECTURE.md, the feature dependency tree in FEATURES.md, and the phase-to-pitfall mapping in PITFALLS.md, the following 7-phase structure is recommended. The daemon must be the first phase — it is the foundation every other feature depends on. Approval flow must come before Ops mode panels because the approval round-trip validates the entire data pipeline end-to-end. Office mode comes last because it is an additive display layer that reads from proven Zustand state.

### Phase 1: Daemon Core + Unified Event Model

**Rationale:** The daemon is the critical path. No UI feature can be built without it. The event schema and WebSocket infrastructure must be locked here — retrofitting either after adapters and UI are built is the highest-cost failure mode in this domain.
**Delivers:** A daemon that receives typed events, persists them to SQLite, and broadcasts them over WebSocket. The `NormalizedEvent` schema is the contract all later work depends on.
**Addresses:** Session persistence (table stakes), local-first privacy (table stakes)
**Avoids:** Premature event schema pitfall, WebSocket reconnect desync pitfall, SQLite WAL checkpoint starvation pitfall
**Must include:** `schemaVersion` + `sequenceNumber` on all events; WAL mode + checkpoint scheduling; sequence-based catch-up protocol on WS reconnect; WebSocket binding to `127.0.0.1` only; Origin header validation on WS upgrade

### Phase 2: Claude Adapter + Approval Foundation

**Rationale:** Claude Code is the primary provider and the hook-based integration is fully documented. Validating the complete event-to-approval round-trip early proves the architecture before adding Codex complexity. Approval timeout logic ships here — not as a follow-up.
**Delivers:** Claude sessions visible in the daemon with real hook events. Full approval round-trip: PreToolUse hook → approval request → browser decision → HTTP response back to Claude Code.
**Addresses:** Real-time event stream (table stakes), approval inbox (core value prop), risk classification, desktop notifications
**Avoids:** Approval deadlock pitfall, provider adapter brittleness pitfall, missed approval notification pitfall
**Must include:** Per-approval `timeoutAt` + `onTimeout` policy; `provider_parse_error` events on validation failure; fixture-based adapter tests; `requireInteraction: true` on browser notifications; three-layer approval escalation (badge → notification → re-notification)

### Phase 3: Browser UI Shell + Real-Time Feed

**Rationale:** Once the daemon has proven event flow, the browser layer validates the full pipeline end-to-end. Office mode is explicitly excluded here — validate Ops mode data flow first before adding canvas complexity.
**Delivers:** Browser showing live Claude session events. Session list, event stream, approval inbox UI with approve/deny actions wired to daemon.
**Addresses:** Live session list (table stakes), real-time event stream (table stakes), approval inbox UI, keyboard navigation (basic)
**Avoids:** React Context for real-time state (use Zustand selective subscriptions from the start); setState on every WebSocket message (buffer in `useRef`)
**Must include:** Zustand store updated from WebSocket handlers outside React; `init` snapshot on connect for full state reconstruction; exponential backoff reconnect with `lastSeenSequence`

### Phase 4: Codex Adapter

**Rationale:** Multi-provider support is a core differentiator and part of the MVP definition. The Codex adapter is isolated by the adapter boundary — adding it does not require changing the daemon core or the UI.
**Delivers:** Codex sessions appearing in the same UI as Claude sessions. Codex approval requests flowing through the same approval inbox.
**Addresses:** Provider-agnostic (multi-provider differentiator), approval inbox (Codex leg)
**Avoids:** Provider adapter brittleness (Codex-specific: lenient JSON-RPC parser; do not rely on `rate_limits`; handle `-32001` overload with 2s backoff retry)
**Must include:** One child process per active Codex session via `child_process.spawn`; stdio JSON-RPC via `readline`; fixture tests against Codex app-server JSONL

### Phase 5: Ops Mode Panels

**Rationale:** With both adapters producing proven event streams, the full operational control surface can be built confidently. Timeline/replay depends on stable event schema and SQLite indexing already in place.
**Delivers:** Session detail panel, timeline/replay with scrubbing, file diff panel, memory panel (read + CLAUDE.md edit).
**Addresses:** File diff view (table stakes), timeline/replay (v1.x), sub-agent hierarchy, memory panel (differentiator)
**Avoids:** Memory normalization over-abstraction (scope to read-federation + CLAUDE.md writes only in v1; all memory sources expose `canEdit` + `sourceType`); diff panel without syntax highlighting (use Monaco with language detection)
**Must include:** SQLite indexes on `(session_id, sequence_number)` and `(session_id, event_type)` before timeline queries; `canEdit: false` for non-CLAUDE.md memory sources; "changes take effect on next session" notice when editing memory for a running session

### Phase 6: Session History + Search

**Rationale:** Once session history accumulates from Phases 1-5, search and comparison features become useful. Building these after the data model is proven avoids designing against unstable event shapes.
**Delivers:** Full-text search across sessions, session comparison view (side-by-side provider outputs).
**Addresses:** Search (v1.x), session comparison (v1.x), filter by provider/status/project
**Avoids:** Full event table scan for search (requires indexes already in place from Phase 5)

### Phase 7: Office Mode

**Rationale:** Office mode is architecturally an additive display layer — it reads from the same Zustand store already proven by Phases 3-6. Building it last means animations are driven by a stable, battle-tested data model. The Pixi-to-React decoupling must be designed before any animation work begins.
**Delivers:** Pixel-art spatial visualization of all active agent sessions. State-driven animations (idle, working, approval-pending, done, failed). Click-through to Ops mode session detail.
**Addresses:** Office mode (differentiator/demo hook), provider-normalized visualization
**Avoids:** Office mode performance collapse (event buffer in `useRef`, drain in `PIXI.Ticker`, React state only for non-canvas DOM); Pixi objects created in React `useEffect` with WS messages in dependency array; running PIXI.Ticker when tab is hidden (`document.visibilitychange` pause/resume)
**Must include:** Performance gate: 10 sessions at 10 events/sec must sustain 45fps; spritesheets for all agent animations; max 12 simultaneous canvas entities (overflow to compact list)

### Phase Ordering Rationale

- The daemon-first order is dictated by the feature dependency tree: every UI feature requires the local daemon. This is not a choice — it is the dependency graph.
- Approval flow in Phase 2 (not Phase 4) is critical: the approval round-trip is the most complex cross-cutting concern (daemon HTTP hook response timing, Approval Manager Promise correlation, browser WS message, SQLite persistence). Validating it with a single provider before adding Codex reduces the debugging surface.
- Codex adapter in Phase 4 (not Phase 2) is deliberate: the adapter boundary means Codex can be added without touching the daemon core or the UI. Delaying it avoids the Codex app-server complexity contaminating the core architecture validation.
- Office mode last is the architecture research's explicit recommendation: it has no blockers on approval flow or persistence — building it last means the data model is proven and the animation state machine has no ambiguity about what state it represents.
- Phases 1-4 constitute the MVP. Phases 5-7 complete the full v1 feature set.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Claude Adapter):** Claude Code hook configuration schema (`~/.claude/settings.json` format) and PermissionRequest hook response envelope need verification against the current Claude Code version at planning time — the docs are marked stable but the hook system is evolving.
- **Phase 4 (Codex Adapter):** The Codex app-server WebSocket transport is marked experimental. The stdio JSON-RPC approach is confirmed stable but the initialization handshake sequence needs verification against the current Codex CLI version at planning time.
- **Phase 5 (Memory Panel):** The CLAUDE.md auto-memory format and the agent-suggested memory hook events need confirmation — PITFALLS.md flags that memory events must be captured from session start and cannot be retrofitted.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Daemon Core):** EventEmitter bus + better-sqlite3 + ws WebSocket server + WAL mode are fully documented patterns with multiple verified real-world examples. No research needed.
- **Phase 3 (Browser UI Shell):** Vite + React + Zustand + WebSocket client hook are extremely well-documented. The reconnect/catch-up pattern is specified precisely in PITFALLS.md.
- **Phase 6 (Search/History):** SQLite full-text search (FTS5) and session comparison are standard patterns. No novel integration challenges.
- **Phase 7 (Office Mode):** PixiJS v8 + @pixi/react v8 are both officially documented. The Ticker-based render loop decoupling pattern is specified in PITFALLS.md with enough precision to implement without additional research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm registry on 2026-04-04; rationale from official docs and ecosystem consensus; no speculative picks |
| Features | HIGH | Competitor landscape directly inspected; Claude Code hooks from official docs; UX patterns from primary published sources; competitive gap analysis is solid |
| Architecture | HIGH | Claude hooks: official Anthropic docs; Codex app-server: official OpenAI docs; EventEmitter + SQLite + ws pattern verified against real-world implementations |
| Pitfalls | HIGH (infra), MEDIUM (adapters) | SQLite WAL, WebSocket reconnect, event schema: well-documented failure modes with multiple independent sources; provider adapter edge cases (Codex JSON-RPC lite, rate_limits bug): MEDIUM due to reliance on community issue reports |

**Overall confidence:** HIGH

### Gaps to Address

- **Claude Code hook configuration automation:** It is unclear whether `~/.claude/settings.json` hook configuration can be injected programmatically by the daemon at startup (removing the manual setup step). This affects onboarding UX significantly. Verify at Phase 2 planning.
- **Codex app-server initialization handshake:** The exact sequence of JSON-RPC calls required to initialize a Codex app-server session (before sending any method calls) is documented but may have changed in recent Codex CLI versions. Capture fixture files from the current version at Phase 4 planning.
- **Memory hook events in Claude Code:** The PITFALLS.md note that "memory events must be captured from session start" implies Claude Code exposes memory-related hook events. The specific hook event names for agent-suggested memory notes need confirmation against the current Claude Code hooks reference before Phase 5 planning.
- **Codex app-server `-32001` retry behavior:** The overload error response is documented but the retry-safe behavior (whether the pending request should be retried or if the agent has already moved on) needs validation with a real Codex app-server instance at Phase 4 planning.

## Sources

### Primary (HIGH confidence)
- [Claude Code Hooks Reference — Official Anthropic Docs](https://code.claude.com/docs/en/hooks) — hook lifecycle events, PermissionRequest, session metadata
- [Claude Code Memory — Official Docs](https://code.claude.com/docs/en/memory) — CLAUDE.md format, auto-memory system
- [Codex App-Server — Official OpenAI Docs](https://developers.openai.com/codex/app-server) — JSON-RPC 2.0 protocol, approval flow, session management
- [PixiJS React — Official Library](https://react.pixijs.io/) — @pixi/react v8, React 19 support, Ticker integration
- [PixiJS v8 Launch Blog](https://pixijs.com/blog/pixi-v8-launches) — WebGL/WebGPU renderer, roundPixels, performance characteristics
- [Drizzle ORM SQLite Docs](https://orm.drizzle.team/docs/get-started-sqlite) — better-sqlite3 pairing, migration workflow
- [SQLite WAL Mode — Official Documentation](https://www.sqlite.org/wal.html) — WAL mode, checkpoint behavior, concurrent reader constraints
- npm registry (verified 2026-04-04): ws@8.20.0, better-sqlite3@12.8.0, drizzle-orm@0.45.2, pixi.js@8.17.1, zustand@5.0.12, @pixi/react@8.0.5, react-diff-view@3.3.3, @monaco-editor/react@4.7.0, chokidar@5.0.0, vite@8.0.3, react@19.2.4, zod@4.3.6, tailwindcss@4.2.2, tsx@4.21.0, typescript@6.0.2

### Secondary (MEDIUM confidence)
- [Pixel Agents — VS Marketplace](https://marketplace.visualstudio.com/items?itemName=pablodelucca.pixel-agents) — competitor feature analysis, Office mode concept validation (41K installs)
- [agents-observe (simple10/GitHub)](https://github.com/simple10/agents-observe) — hook-based event streaming architecture reference
- [agentsview (wesm/GitHub)](https://github.com/wesm/agentsview) — multi-provider feature set reference
- [Designing For Agentic AI: Practical UX Patterns — Smashing Magazine (2026)](https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/) — Autonomy Dial, Intent Preview, approval UX patterns
- [Codex exec mode rate_limits always None — GitHub Issue #14728](https://github.com/openai/codex/issues/14728) — confirmed Codex exec mode limitation
- [Claudeck: Browser UI for Claude Code](https://dev.to/hamed_farag/i-built-a-browser-ui-for-claude-code-heres-why-4959) — real-world daemon architecture validation (Express + ws + better-sqlite3)
- [Event Sourcing Fails: 5 Real-World Lessons — Kite Metric](https://kitemetric.com/blogs/event-sourcing-fails-5-real-world-lessons) — schema migration cost evidence
- [How We Improved Reliability of WebSocket Connections — Making Close](https://making.close.com/posts/reliable-websockets/) — reconnect + catch-up protocol patterns
- [better-sqlite3 Performance Guide](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md) — WAL mode configuration, checkpoint strategies
- [PixiJS Performance Tips — Official Docs](https://pixijs.com/8.x/guides/concepts/performance-tips) — Ticker-based render loop, spritesheet batching

### Tertiary (MEDIUM-LOW confidence)
- [tsx vs ts-node comparison](https://tsx.is/) — community consensus on ESM support; ts-node deprecation for ESM use cases
- [Zustand external-update capability for WebSocket use cases](https://pmnd.rs/blog/announcing-zustand-v5) — confirmed via v5 announcement; Jotai workaround requirement inferred from Jotai docs
- [Streaming Backends & React: Re-render Chaos — SitePoint](https://www.sitepoint.com/streaming-backends-react-controlling-re-render-chaos/) — setState-on-every-message failure mode evidence

---
*Research completed: 2026-04-04*
*Ready for roadmap: yes*
