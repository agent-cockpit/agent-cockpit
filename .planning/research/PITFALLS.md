# Pitfalls Research

**Domain:** Local daemon + browser UI devtool — real-time agent monitoring with approval flows
**Researched:** 2026-04-04
**Confidence:** HIGH (event schema, SQLite, WebSocket), MEDIUM (provider adapters, approval flow), MEDIUM (Office mode performance)

---

## Critical Pitfalls

### Pitfall 1: Premature Event Schema — Hard to Migrate Later

**What goes wrong:**
The unified event schema is defined informally during early development (e.g., as ad-hoc TypeScript interfaces), with provider-specific field names leaking through. Once events are persisted to SQLite and the replay/timeline UI is built on top, schema changes require either migrating historical records (violating event immutability) or maintaining upcasters for every old shape. This is the single highest-cost rewrite trigger in event-sourced systems.

**Why it happens:**
Teams start with a single provider (Claude Code) and defer normalization to "when we add Codex." By that point, the schema assumptions are baked into the DB schema, the timeline component, the diff panel, and the approval classifier. Retrofit normalization is 3-5x the work of designing it upfront.

**How to avoid:**
Define a canonical `AgentEvent` schema before writing a single adapter. Include: `eventId` (UUID), `sessionId`, `provider` (enum: `claude_code | codex | unknown`), `eventType` (controlled vocabulary), `occurredAt` (ISO 8601 UTC), `sequenceNumber` (monotonic per session), `payload` (typed union by `eventType`), `schemaVersion` (integer). Store `raw` as an opaque JSON blob alongside, enabling re-normalization without loss. Treat `payload` fields as additive: consumers must tolerate unknown keys and use defaults for missing keys. Write upcasters before merging any schema change.

**Warning signs:**
- TypeScript types that include `claudeHookData?` or `codexEvent?` as top-level fields
- The word "normalize" appearing in TODO comments rather than in shipped code
- Timeline component that accepts different shapes depending on provider branch

**Phase to address:** Phase 1 (Daemon foundation + event schema) — must be locked before any adapter work begins.

---

### Pitfall 2: Approval Deadlock — Agent Hangs Waiting Forever

**What goes wrong:**
An agent issues an approval request, the daemon queues it, and the browser UI is either closed, unreachable, or the user never sees the notification. The agent blocks indefinitely (or until its own internal timeout). There is no explicit timeout or fallback policy on the control-plane side, so the session appears "stuck" with no recovery path visible in the UI.

**Why it happens:**
Approval flows are initially built for the demo case (browser open, user present, immediate response). The timeout case is deferred. Claude Code's permission hooks have their own timeout (10 minutes as of v2.1.3), but the daemon may not know this, and Codex app-server's bounded queue rejects new requests with `-32001` when overloaded, which can compound with pending approvals.

**How to avoid:**
Every approval record must carry: `requestedAt`, `timeoutAt` (wall-clock deadline), `onTimeout` policy (`deny | allow | escalate`). The daemon must run a background poller (every 5–10s) that expires timed-out approvals and emits a synthetic `approval_expired` event with the policy applied. Default `onTimeout` for destructive actions (shell, file-write, network) is `deny`. Log the expiry as a timeline event so replay shows why the agent was interrupted. Surface a persistent "N approvals waiting" badge in the UI that survives page navigations.

**Warning signs:**
- Sessions that stay in `pending_approval` state indefinitely in the database
- No `timeoutAt` column in the approvals table
- Approval notification that disappears on browser refresh without persisting the pending state

**Phase to address:** Phase 2 (Approval inbox + daemon approval routing) — timeout and expiry logic must ship with the first approval implementation, not be added later.

---

### Pitfall 3: WebSocket Reconnection — State Desync After Reconnect

**What goes wrong:**
After a WebSocket reconnection (daemon restart, sleep/wake, network blip), the browser UI shows stale session state. Events that arrived during the disconnect window are not replayed, so the UI shows a session as "running" when it completed, or shows no pending approvals when there are several. Worse: reconnect storms can occur if the client uses no backoff, hammering a restarting daemon.

**Why it happens:**
The initial WebSocket implementation pushes live events only. There is no concept of a "catch-up" sequence. After reconnect, the client re-subscribes but has no way to request events it missed. Additionally, the client stores the `WebSocket` instance in React component state (not `useRef`), causing a new connection on every render during reconnect attempts.

**How to avoid:**
Design the protocol with a `lastSeenSequence` field in the client's `subscribe` message. On reconnect, the daemon replays all events with `sequenceNumber > lastSeenSequence` for each active session before resuming live streaming. Cap replay to the last 500 events per session to bound latency. Use exponential backoff with jitter (minimum 500ms, cap at 30s, max 10 attempts) before giving up and showing an offline banner. Store the WebSocket reference in `useRef`, not state. Persist `lastSeenSequence` in `sessionStorage` so page refreshes can also catch up.

**Warning signs:**
- No `sequenceNumber` on events in the database
- Reconnect logic that calls `new WebSocket(url)` inside a `useEffect` without backoff
- UI that shows "Loading..." indefinitely after a daemon restart

**Phase to address:** Phase 1 (WebSocket infrastructure) — the sequence/catch-up protocol must be in the initial design; retrofitting it requires changing the event schema and the client subscription protocol simultaneously.

---

### Pitfall 4: SQLite WAL Checkpoint Starvation Under Continuous Reads

**What goes wrong:**
In WAL mode, SQLite cannot checkpoint (compact the WAL file back into the main database) if there is always at least one active reader. The Agent Mission Control daemon maintains persistent read connections for the UI's timeline and session-list queries. The WAL file grows without bound — eventually reaching hundreds of MB — and read/write performance degrades significantly.

**Why it happens:**
WAL mode is correctly enabled for concurrency, but `PRAGMA wal_autocheckpoint` is left at its default (1000 pages) and the daemon never explicitly calls `PRAGMA wal_checkpoint(TRUNCATE)`. Long-lived read transactions from timeline scrubbing prevent checkpoints from completing. Developers notice disk usage but don't connect it to WAL growth until it's severe.

**How to avoid:**
Set `PRAGMA busy_timeout = 5000` and `PRAGMA journal_mode = WAL` at daemon startup. Set `PRAGMA wal_autocheckpoint = 200` (more aggressive than default). Add a scheduled checkpoint task (every 60s) using `db.pragma('wal_checkpoint(TRUNCATE)')` when no active approval is pending. Use `better-sqlite3` for all database access (synchronous, no connection-pool overhead, single writer by design). Keep read transactions short — do not hold a read transaction open across an async boundary. Use a single connection object for all writes; open short-lived read connections for queries.

**Warning signs:**
- `.db-wal` file growing beyond 10MB
- Read query latency increasing over time without schema changes
- `SQLITE_BUSY` errors appearing in daemon logs despite WAL mode

**Phase to address:** Phase 1 (SQLite schema + daemon foundation) — WAL mode configuration and checkpoint scheduling must be part of the initial database setup.

---

### Pitfall 5: Provider Adapter Brittleness — Undocumented Field Reliance

**What goes wrong:**
The Claude Code adapter is built against specific hook payload shapes observed in the current version. The Codex adapter relies on JSONL field names (e.g., `rate_limits`) that are documented as always `None` at runtime in exec mode (confirmed open issue #14728). When providers update their output format, the adapter silently drops events or produces malformed normalized events — the UI shows no sessions, or shows sessions frozen at the last valid event.

**Why it happens:**
Adapters are written against observed behavior (log files, terminal output) rather than validated against a formal schema. The Codex app-server uses a "JSON-RPC lite" variant that omits the `"jsonrpc": "2.0"` header — naive JSON-RPC parsers reject it. Claude Code hook payloads evolve across Claude Code versions; there is no version handshake in the hook protocol.

**How to avoid:**
Define a `RawProviderEvent` type with an `unknown` payload and validate at the adapter boundary using a runtime validator (e.g., `zod`). Emit a `provider_parse_error` event (not a crash) when validation fails, so the timeline still shows that something happened. Never access nested fields without optional chaining. Detect Claude Code version from the hook `$SESSION` metadata and log it. For Codex: do not rely on `rate_limits` from exec mode; use app-server mode for production and JSONL exec as a declared fallback. Write adapter tests against fixture files of real provider output captured at known versions.

**Warning signs:**
- Adapter code with `event.payload.tool.input.command` (deeply nested, no optional chaining)
- No fixture-based tests for the adapter parse layer
- The word "TODO: handle unknown event types" in adapter code

**Phase to address:** Phase 2 (Provider adapters) — validation layer and fixture tests must be part of adapter acceptance criteria, not added after.

---

### Pitfall 6: Memory Normalization Over-Abstraction

**What goes wrong:**
The memory panel attempts to create a unified edit surface over CLAUDE.md (project-level markdown), Claude auto-memory (auto-generated summaries), Codex memory (different format, different location), and agent-suggested memory updates. The abstraction becomes leaky because the underlying formats differ in structure, mutability, and agent semantics. Edits made through the UI are saved to the wrong layer, or the diff between "what the agent sees" and "what the UI shows" causes confusion.

**Why it happens:**
Memory normalization sounds architecturally clean but is deferred to "figure it out during implementation." The scope grows to include: reading, writing, diffing, approving agent suggestions, pinning, and distinguishing shared vs. local-only. Each of those operations has provider-specific edge cases. The result is a panel that works for demos but corrupts or silently drops memory on edge cases.

**How to avoid:**
Treat memory sources as read-only federation in v1: display them with clear source labels (`claude/project`, `claude/auto`, `codex/workspace`) but only allow writes to CLAUDE.md and only for Claude Code sessions. Defer multi-provider write normalization to post-MVP. Represent each memory source as a `MemorySource` object with `sourceType`, `path`, `content`, `lastModified`, `canEdit` (boolean), and `agentSees` (boolean, reflects whether the agent actually reads this at session start). Show `canEdit: false` sources as read-only in the UI with an explicit label.

**Warning signs:**
- A `saveMemory()` function that branches on provider type inside the memory panel component
- Memory panel that accepts a generic `content: string` without knowing which file to write it to
- No `sourceType` field in the memory data model

**Phase to address:** Phase 3 (Memory panel) — scope must be explicitly constrained to read-federation + CLAUDE.md writes before implementation begins.

---

### Pitfall 7: Office Mode Performance Collapse with Many Active Sessions

**What goes wrong:**
Office mode renders each agent as an animated Pixi.js entity. With 10+ concurrent sessions each receiving real-time events (tool calls, state transitions), the animation ticker processes state updates on every frame. When session events arrive at high frequency (agent is running many tool calls), each event triggers a React state update, which cascades into Pixi object property changes in the same frame. The result is dropped frames (below 30fps) and eventually a frozen canvas.

**Why it happens:**
The initial implementation passes WebSocket events directly into React state, which then drives the Pixi scene graph. There is no buffering layer between the event stream and the render loop. At low agent activity this works fine; it breaks at demo time when multiple agents are actively running.

**How to avoid:**
Decouple the event pipeline from the render loop. Buffer incoming WebSocket events in a `useRef` array (outside React state). On each `requestAnimationFrame`, drain the buffer: compute the new derived state for each visible agent entity and apply it to the Pixi scene graph directly (not through React state). Only update React state for data that drives React-rendered DOM outside the canvas (session list, approval badge counts, etc.). Use `PIXI.Ticker` for animations independent of event arrival. Limit the Office mode canvas to 12 simultaneous visible entities max; overflow goes to a compact list. Use spritesheets for all agent animations to minimize texture swaps.

**Warning signs:**
- Office mode component that calls `setState()` on every received WebSocket message
- Pixi objects created inside a React `useEffect` with WebSocket messages in the dependency array
- Frame rate below 45fps with 5 idle agents (no tool calls active)

**Phase to address:** Phase 4 (Office mode) — the event-to-render pipeline architecture must be designed before any animation work, not refactored after.

---

### Pitfall 8: Approval Notification Delivery — The "Missed Approval" Silent Failure

**What goes wrong:**
An agent issues a destructive approval request while the user is in a different browser tab or the Ops mode panel for a different session. The notification fires once (browser notification, if granted) and is not re-triggered. The user dismisses it as noise. The approval expires by timeout and the session is denied or stalls. The user blames the tool for "killing my agent."

**Why it happens:**
Notification delivery is treated as fire-and-forget. There is no persistent visual indicator that a specific session is blocked waiting for approval. The approval badge count in the header increments, but the user doesn't notice unless they are already looking at the UI.

**How to avoid:**
Implement a three-layer escalation: (1) Approval badge with session-specific indicator (pulsing red dot on the session card/agent entity in both Office and Ops modes). (2) Browser notification with `requireInteraction: true` so it does not auto-dismiss. (3) After 30s with no response, re-notify with urgency label ("Action required: approval expiring in Xs"). In Office mode, the agent entity's animation must shift to a "waiting" state (distinct animation, no movement) until the approval is resolved. The approval inbox must be reachable in one click from any surface.

**Warning signs:**
- No `requireInteraction: true` in the Notification constructor
- Approval state not reflected in the Office mode agent entity animation
- Approval inbox only accessible through a specific navigation path (not a global shortcut)

**Phase to address:** Phase 2 (Approval inbox) — notification delivery requirements must be specified before implementation, not added after the first user complaint.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Inline event type strings (`"tool_call"`) instead of enum | Faster to write | Schema drift, typos, impossible to grep for all usages | Never — use a const enum from day 1 |
| Skip `sequenceNumber` on events, use `occurredAt` for ordering | Simpler schema | Clock skew makes event ordering unreliable; catch-up replay impossible | Never |
| Single shared SQLite connection for reads and writes | Simpler setup | SQLITE_BUSY under concurrent load; WAL advantage eliminated | Never in daemon context |
| Store approval state only in memory (not SQLite) | Faster approval roundtrip | Approvals lost on daemon crash; agent hangs after restart | Never — approvals must survive restarts |
| React Context for WebSocket event delivery to all components | Idiomatic React | Every event re-renders every subscribed component; collapses at 5+ events/sec | MVP only with explicit refactor plan; replace before Office mode |
| Hard-code Claude Code hook path | Works for the common case | Breaks for non-default Claude Code installations; breaks on Windows WSL paths | MVP only — make configurable in Phase 1 |
| Pixi scene updated from React state | Easy to reason about | Frame rate drops under event load; causes "tearing" between React and Pixi state | Never — decouple from the start |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Claude Code hooks | Watching for hook output on a fixed file path without detecting Claude Code version | Read `$SESSION` metadata from hook payload; log Claude Code version at session start; validate payload shape against versioned fixtures |
| Codex app-server | Using a strict JSON-RPC 2.0 parser (expects `"jsonrpc": "2.0"` header) | The Codex app-server uses a "JSON-RPC lite" variant — parse JSONL lines directly with a lenient parser, not a JSON-RPC library |
| Codex exec mode JSONL | Relying on `rate_limits` field for usage display | Field is always `None` in exec mode (open issue #14728); use app-server mode for rich event data; display N/A for rate limits in exec fallback mode |
| Codex app-server overload | No handling for `-32001` "Server overloaded; retry later" error | Treat `-32001` as a retryable error with 2s backoff; surface "Codex busy, retrying" status in session card rather than crashing the adapter |
| Claude Code subagent events | Treating subagent sessions as independent top-level sessions | Subagents emit `SubagentStop` and have a parent session ID in the hook payload; model as child sessions under a parent, not siblings |
| SQLite from Node.js | Using `node-sqlite3` (async, callback-based) with WAL mode | Use `better-sqlite3` (synchronous); async SQLite drivers with WAL can produce subtle race conditions in single-process Node.js daemons |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| setState on every WebSocket message | UI jank, high CPU, React profiler shows continuous re-renders | Buffer in `useRef`, flush once per animation frame via `requestAnimationFrame` | ~5 messages/sec with 3+ subscribed components |
| No event sequence numbers; use timestamp for ordering | Events appear in wrong order during replay; events from the same millisecond have undefined order | Add `sequenceNumber` (monotonic integer per session) at event creation in daemon; sort by `(sessionId, sequenceNumber)` | Any session with >1 tool call per millisecond (common for fast agents) |
| WAL file allowed to grow without checkpoint | Read query latency increases; disk usage balloons; eventual crash | Schedule `wal_checkpoint(TRUNCATE)` every 60s; set aggressive `wal_autocheckpoint = 200` | WAL file >50MB (typically after 4–8 hours of continuous agent activity) |
| Full event table scan for timeline queries | Timeline panel slow to open; gets worse as history grows | Index on `(session_id, sequence_number)`; index on `(session_id, event_type)` for filtered views; add `(occurred_at DESC)` index for recent-sessions query | >10,000 events total (roughly 5 busy sessions) |
| Pixi scene graph updated from React render cycle | Canvas frame rate coupled to React render rate; drops to <30fps under load | Update Pixi objects in `PIXI.Ticker` callback using buffered state; React renders only non-canvas DOM | 3+ actively-running agents in Office mode |
| All sessions loaded into memory on daemon start | Startup time grows with history; memory usage proportional to total historical sessions | Load only active sessions on startup; lazy-load historical sessions on demand | >100 total historical sessions |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Binding WebSocket server to `0.0.0.0` instead of `127.0.0.1` | Browser UI accessible from any host on the local network; any LAN peer can send approval decisions | Bind exclusively to `127.0.0.1` in v1; make remote access an explicit opt-in with auth token in v2 |
| Logging full command strings to SQLite without redaction | Shell commands often contain secrets (API keys in env vars, passwords in args); SQLite file is readable by any local process | Redact patterns matching common secret formats (env var assignments, `--password`, `--token`, bearer tokens) before persisting to `payload.command`; store redacted form only |
| Serving the browser UI without any origin check on the WebSocket upgrade | A malicious web page open in the same browser can connect to the daemon WebSocket and send fake approval responses | Validate `Origin` header on WebSocket upgrade; only accept connections from `localhost` origins; reject cross-origin connections |
| Exposing raw agent tool call payloads in the diff panel | Tool call payloads may include sensitive file paths, database credentials embedded in queries, or private keys in file contents | Apply the same redaction pipeline used for command logging to tool call payload fields before rendering in the UI |
| No integrity check on approval decisions stored in SQLite | A local process could modify the SQLite file to retroactively change approval decisions, creating misleading audit trail | Approval records are append-only; never UPDATE an existing approval record; add a `decisionHash` column (HMAC of decision fields) for forensic integrity |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Approval inbox requires navigation to a specific panel | User misses approvals when working in another panel; agent stalls silently | Make pending approval count a persistent global badge; surface "Approve" inline in the Office mode agent card without requiring panel navigation |
| Session switching loses scroll position and panel state | User constantly re-navigates to find their place after switching sessions | Store per-session UI state (scroll position, active tab, expanded diff files) in a `Map` keyed by `sessionId` in memory; restore on switch |
| Timeline scrubber shows all events with equal weight | Important events (approvals, failures, file changes) are visually indistinguishable from routine tool calls | Use color-coded event type markers on the scrubber track; make approval and failure events 2x taller; add "jump to next approval" keyboard shortcut |
| Office mode animations run even when the tab is hidden | CPU/GPU usage continues when user switches away; battery drain | Pause `PIXI.Ticker` on `document.visibilitychange` = hidden; resume on visible |
| Diff panel shows raw unified diff without syntax highlighting | Reading diffs is slow and error-prone for large files | Use Monaco's diff editor component (already planned in stack) with language detection from file extension; add file tree with change counts |
| Memory panel allows editing CLAUDE.md without showing what the agent currently reads | User edits memory but the agent already loaded the old version; confusion about when changes take effect | Show `agentSees: true/false` on each memory source; display a "changes take effect on next session" notice when editing a source for a running session |

---

## "Looks Done But Isn't" Checklist

- [ ] **Approval inbox:** Verify approvals persist across daemon restarts — restart the daemon with a pending approval and confirm the agent is still blocked and the UI shows the pending state after reconnect.
- [ ] **WebSocket reconnect:** Close the daemon while the UI is open, restart it, and verify the session list and timeline are fully up to date without a manual page refresh.
- [ ] **Event replay:** Scrub the timeline to a historical event and verify that the state displayed matches the raw database record — not the current live state.
- [ ] **WAL health:** Run 30 minutes of continuous agent activity and confirm the `.db-wal` file has been checkpointed and is below 5MB.
- [ ] **Office mode under load:** Open Office mode with 10 simultaneous sessions running, verify frame rate stays above 45fps in Chrome DevTools Performance panel.
- [ ] **Provider adapter versioning:** Replay a fixture file from an older Claude Code version through the current adapter and verify it produces valid normalized events without runtime errors.
- [ ] **Approval timeout:** Set a short timeout (30s), let it expire with no browser interaction, and verify the correct `onTimeout` policy was applied and logged as a timeline event.
- [ ] **Memory panel safety:** Edit CLAUDE.md through the memory panel, verify the file on disk matches, then confirm that a running session is notified (or the UI warns) that the file changed.
- [ ] **Secrets redaction:** Create a session where a tool call includes a string matching `export API_KEY=...`; verify the raw value does not appear anywhere in the SQLite database or the UI.
- [ ] **Notification persistence:** Trigger an approval notification, dismiss the browser notification, and verify the approval badge still shows as pending in the UI.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Event schema migration needed after data is persisted | HIGH | Write a migration script that reads `raw` blob, re-normalizes to new schema, writes to new table; run as offline migration; add schema version guard at daemon startup |
| WAL file bloated beyond 100MB | LOW | Run `PRAGMA wal_checkpoint(TRUNCATE)` with no active readers; restart daemon if long-lived connections prevent checkpoint; no data loss risk |
| Approval deadlock (agent hung, no timeout) | MEDIUM | Add an operator command (`gsd daemon repair-approvals`) that expires all approvals older than N minutes with `deny` policy; restart affected session manually |
| WebSocket catch-up not implemented, UI desynced | MEDIUM | Force a full state refresh endpoint (`GET /api/sessions/snapshot`) that returns current state for all sessions; UI calls this on reconnect as a stopgap until sequence-based catch-up is built |
| Provider adapter broken by upstream update | MEDIUM | Adapter emits `provider_parse_error` events (if prevention was followed); disable affected adapter in config; continue running with remaining provider; deploy hotfix adapter against new fixture |
| Pixi performance collapse | MEDIUM | Disable Office mode temporarily (feature flag); fall back to Ops mode only; profile Ticker callback to find the hot path; isolate event buffer drain as the fix |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Premature event schema | Phase 1: Daemon foundation | All adapter events pass through a single `parseToAgentEvent()` function; schema version field present on all DB rows |
| Approval deadlock | Phase 2: Approval inbox | Automated test: create approval with 5s timeout, assert `approval_expired` event emitted; assert agent state updated |
| WebSocket reconnect desync | Phase 1: WebSocket infrastructure | Integration test: send 10 events, disconnect client, send 10 more, reconnect with `lastSeenSequence=10`, assert all 20 events received in order |
| SQLite WAL starvation | Phase 1: SQLite schema | Load test: 1 hour continuous writes + reads; assert WAL file never exceeds 10MB |
| Provider adapter brittleness | Phase 2: Provider adapters | Fixture test suite: 5 Claude Code hook payload fixtures at different versions; 3 Codex app-server JSONL fixture files; all must normalize without errors |
| Memory normalization over-abstraction | Phase 3: Memory panel | Scope gate: memory panel PR must include `canEdit` and `sourceType` on all memory sources; no write path for non-CLAUDE.md sources in v1 |
| Office mode performance collapse | Phase 4: Office mode | Performance gate: 10 sessions receiving 10 events/sec; frame rate must stay above 45fps measured in CI with headless Chrome |
| Missed approval notification | Phase 2: Approval inbox | Manual test: trigger approval, switch to different browser tab, wait 10s, verify re-notification fired; verify `requireInteraction: true` |

---

## Sources

- [SQLite WAL Mode — Official Documentation](https://www.sqlite.org/wal.html)
- [better-sqlite3 Performance Guide](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md)
- [What to do about SQLITE_BUSY despite setting a timeout — Bert Hubert](https://berthug.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/)
- [How SQLite Scales Read Concurrency — Fly.io](https://fly.io/blog/sqlite-internals-wal/)
- [Codex App Server Documentation — OpenAI Developers](https://developers.openai.com/codex/app-server)
- [Codex App Server Architecture — OpenAI Blog](https://openai.com/index/unlocking-the-codex-harness/)
- [Codex exec mode rate_limits always None — GitHub Issue #14728](https://github.com/openai/codex/issues/14728)
- [Simple Patterns for Event Schema Versioning — event-driven.io](https://event-driven.io/en/simple_events_versioning_patterns/)
- [Event Sourcing Fails: 5 Real-World Lessons — Kite Metric](https://kitemetric.com/blogs/event-sourcing-fails-5-real-world-lessons)
- [Claude Code Hooks Guide — Official Docs](https://code.claude.com/docs/en/hooks-guide)
- [Claude Code Memory — Official Docs](https://code.claude.com/docs/en/memory)
- [PixiJS Performance Tips — Official Docs](https://pixijs.com/8.x/guides/concepts/performance-tips)
- [Streaming Backends & React: Re-render Chaos in High-Frequency Data — SitePoint](https://www.sitepoint.com/streaming-backends-react-controlling-re-render-chaos/)
- [How We Improved Reliability of WebSocket Connections — Making Close](https://making.close.com/posts/reliable-websockets/)
- [Human-in-the-Loop Architecture — Agent Patterns](https://www.agentpatterns.tech/en/architecture/human-in-the-loop-architecture)
- [How to Design a Human-in-the-Loop Agent Flow Without Killing Velocity — Medium](https://medium.com/rose-digital/how-to-design-a-human-in-the-loop-agent-flow-without-killing-velocity-fe96a893525e)
- [Common Pitfalls When Using Socket.io — Moldstud](https://moldstud.com/articles/p-common-pitfalls-when-using-socketio-and-how-to-avoid-them-essential-tips-for-developers)
- [Complete Guide to AI Agent Memory Files — Medium](https://medium.com/data-science-collective/the-complete-guide-to-ai-agent-memory-files-claude-md-agents-md-and-beyond-49ea0df5c5a9)

---
*Pitfalls research for: Agent Mission Control — local daemon + browser UI + real-time WebSocket + SQLite + provider adapters*
*Researched: 2026-04-04*
