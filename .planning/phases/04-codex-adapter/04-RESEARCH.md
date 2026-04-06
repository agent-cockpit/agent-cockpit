# Phase 4: Codex Adapter - Research

**Researched:** 2026-04-05
**Domain:** Codex CLI `app-server` JSON-RPC stdio protocol, process lifecycle, approval round-trip, session resume
**Confidence:** HIGH

---

## Summary

Phase 4 adds a Codex adapter that connects to `codex app-server` via stdio JSON-RPC (JSONL framing), translates its item/turn event stream into `NormalizedEvent` objects, handles the in-band approval round-trip, and supports session resume from SQLite.

The Codex app-server is a long-lived child process spawned with `child_process.spawn('codex', ['app-server'], { stdio: ['pipe', 'pipe', 'inherit'] })`. Communication uses JSONL over stdin/stdout — one JSON-RPC message per line (no `"jsonrpc":"2.0"` header; this is a JSON-RPC *lite* variant). The client reads stdout via `node:readline` and writes requests/responses to stdin. Every connection begins with a mandatory `initialize` / `initialized` handshake before any other method works.

Approval requests arrive as server-initiated JSON-RPC requests with an `id` field. The client must reply to the **same `id`** with `{ "id": N, "result": { "decision": "accept"|"decline"|... } }`. This is the key architectural difference from the Claude adapter: Codex approvals are **synchronous in-band** replies over the same stdio channel (not open HTTP responses held in a Map). The daemon will maintain a `pendingApprovals` Map keyed by the server's `id` (integer), correlate browser WebSocket decisions to it, and write the reply to `proc.stdin`.

Session resume uses the `threadId` (`thr_xxx` format) returned by `thread/start`. The daemon must persist this mapping (`sessionId` UUID → `threadId` string) to SQLite so it survives restarts. On resume, `thread/resume` is called with the persisted `threadId`.

The Phase 3 `POST /api/sessions` handler already returns `{ sessionId, mode: 'spawn' }` for Codex but does not yet spawn the process. Phase 4 completes that stub.

**Primary recommendation:** Implement the adapter as `packages/daemon/src/adapters/codex/codexAdapter.ts` — a class that manages the child process, stdin/stdout readline loop, the initialize handshake, event mapping, and approval reply dispatch. Wire it into `index.ts` alongside the hook server. No new npm packages needed.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DAEMON-05 | Codex adapter: connects to `codex app-server` via stdio JSON-RPC, parses item/turn events, handles approval requests in-band, supports session resume | Full protocol documented in official OpenAI Codex app-server docs; session resume via `thread/resume` + persisted `threadId`; approval round-trip via ID-matching response to server-initiated request |
</phase_requirements>

---

## Standard Stack

### Core (no new dependencies required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:child_process` | built-in | Spawn `codex app-server` process | Standard Node API; `spawn` with `stdio: ['pipe', 'pipe', 'inherit']` |
| `node:readline` | built-in | Read JSONL lines from `proc.stdout` | Official recommended pattern from OpenAI codex app-server client examples |
| `@cockpit/shared` | workspace | `NormalizedEvent` types | Already in project; adapter maps Codex events to this schema |
| `better-sqlite3` | 12.8.0 (existing) | Persist `threadId` → `sessionId` mapping | Already in project; new `codex_sessions` table for resume support |

### No New npm Dependencies

The Codex adapter uses only Node built-ins and packages already in the workspace.

**Installation:**
```bash
# No new packages — built-ins only
```

---

## Architecture Patterns

### Recommended File Structure

```
packages/daemon/src/adapters/codex/
├── codexAdapter.ts        # Main adapter class: spawn, readline, event loop, approval dispatch
├── codexParser.ts         # Map Codex notifications/items → NormalizedEvent
├── codexRiskClassifier.ts # Classify commandExecution/fileChange approval type + risk level
└── __tests__/
    └── codexParser.test.ts  # Unit tests with fixture JSONL payloads
```

New DB migration in `database.ts`:
```sql
CREATE TABLE IF NOT EXISTS codex_sessions (
  session_id   TEXT PRIMARY KEY,   -- our UUID
  thread_id    TEXT NOT NULL,      -- thr_xxx from codex app-server
  workspace    TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
```

### Pattern 1: JSONL Reader over stdio

**What:** Use `readline.createInterface` on `proc.stdout` to get one complete JSON-RPC message per `line` event.

**When to use:** Always — Codex uses JSONL framing (one message per newline).

**Example:**
```typescript
// Source: https://developers.openai.com/codex/app-server
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const proc = spawn('codex', ['app-server'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

const rl = readline.createInterface({ input: proc.stdout! });

rl.on('line', (line) => {
  try {
    const msg = JSON.parse(line) as CodexMessage;
    handleMessage(msg);
  } catch (err) {
    // emit provider_parse_error — do NOT crash
    eventBus.emit('event', buildParseError('codex', line, String(err)));
  }
});
```

### Pattern 2: Initialize Handshake

**What:** Before any other method, send `initialize` and wait for its response, then send `initialized` notification.

**When to use:** Once at adapter startup, before any `thread/start` or `thread/resume`.

**Example:**
```typescript
// Source: https://developers.openai.com/codex/app-server
function sendRequest(proc: ChildProcess, id: number, method: string, params: unknown): void {
  const msg = JSON.stringify({ method, id, params }) + '\n';
  proc.stdin!.write(msg);
}

function sendNotification(proc: ChildProcess, method: string, params: unknown): void {
  const msg = JSON.stringify({ method, params }) + '\n';
  proc.stdin!.write(msg);
}

// Handshake sequence:
sendRequest(proc, 0, 'initialize', {
  clientInfo: { name: 'cockpit-daemon', title: 'Agent Cockpit', version: '0.1.0' },
  capabilities: { experimentalApi: true },
});
// On receiving response with id: 0 (initialize result):
sendNotification(proc, 'initialized', {});
// Now ready to call thread/start or thread/resume
```

### Pattern 3: Server-Initiated Approval Round-Trip (KEY DIFFERENCE from Claude adapter)

**What:** Codex sends approval requests **as JSON-RPC requests with an `id`**. The client must reply to the same `id` on stdin. There is no open HTTP response to hold; the reply goes back over the same stdio channel.

**When to use:** When receiving `item/commandExecution/requestApproval` or `item/fileChange/requestApproval` notifications.

**Example:**
```typescript
// Source: https://developers.openai.com/codex/app-server + WebSearch verification

// Map: server's request id → { approvalId (our UUID), timer }
const pendingCodexApprovals = new Map<number, { approvalId: string; timer: NodeJS.Timeout }>();

function handleApprovalRequest(proc: ChildProcess, msg: CodexApprovalRequest): void {
  const approvalId = randomUUID();
  const { id: serverId, params } = msg; // serverId is the integer id from Codex

  // Register in our approval system
  const timer = setTimeout(() => {
    // Auto-deny on timeout
    pendingCodexApprovals.delete(serverId);
    proc.stdin!.write(JSON.stringify({ id: serverId, result: { decision: 'decline' } }) + '\n');
    approvalQueue.handleTimeout(approvalId, db);
  }, APPROVAL_TIMEOUT_MS);

  pendingCodexApprovals.set(serverId, { approvalId, timer });
  // onDecisionNeeded → ApprovalQueue.register() → eventBus.emit(approval_request)
}

// When browser sends decision via WebSocket:
function resolveCodexApproval(approvalId: string, decision: 'approve' | 'deny' | 'always_allow'): void {
  // Find serverId for this approvalId (reverse map)
  const entry = [...pendingCodexApprovals.entries()].find(([, v]) => v.approvalId === approvalId);
  if (!entry) return;
  const [serverId, { timer }] = entry;
  pendingCodexApprovals.delete(serverId);
  clearTimeout(timer);

  const codexDecision = decision === 'approve' || decision === 'always_allow' ? 'accept' : 'decline';
  proc.stdin!.write(JSON.stringify({ id: serverId, result: { decision: codexDecision } }) + '\n');
}
```

### Pattern 4: Event Mapping (Codex → NormalizedEvent)

**What:** Map Codex's `item/started`, `item/completed`, `turn/started`, `turn/completed` notifications to `NormalizedEvent`.

| Codex Notification | NormalizedEvent type | Notes |
|-------------------|----------------------|-------|
| `turn/started` (first for session) | `session_start` | Only emit once per session |
| `turn/completed` (status: failed/completed) | `session_end` | Map `status` to exitCode logic |
| `item/started` (type: commandExecution) | `tool_call` | toolName: command joined string |
| `item/started` (type: fileChange) | `file_change` | filePath from params |
| `item/commandExecution/requestApproval` | `approval_request` | Triggers approval flow |
| `item/fileChange/requestApproval` | `approval_request` | Triggers approval flow |

### Pattern 5: Session Resume

**What:** On `POST /api/sessions` for Codex with `threadId` provided, look up the `codex_sessions` table, call `thread/resume` instead of `thread/start`.

**Example:**
```typescript
// In codexAdapter.ts
async function startOrResumeSession(db: Database, sessionId: string, workspacePath: string, existingThreadId?: string): Promise<void> {
  if (existingThreadId) {
    sendRequest(proc, nextId(), 'thread/resume', { threadId: existingThreadId });
  } else {
    sendRequest(proc, nextId(), 'thread/start', {
      cwd: workspacePath,
      approvalPolicy: 'on-action', // require human approval for actions
    });
    // On thread/started notification: persist threadId to codex_sessions table
  }
}
```

### Anti-Patterns to Avoid

- **Holding stdout lines in memory waiting for a specific response id:** Use an async request-response correlation Map (`pendingRequests: Map<number, (result) => void>`) instead.
- **Crashing on JSONL parse error:** Catch `JSON.parse` errors, emit `provider_parse_error`, continue the readline loop.
- **Reusing request IDs:** Use a monotonically increasing counter per adapter instance; duplicate IDs cause the server to silently drop responses.
- **Writing to stdin after process exit:** Gate all `proc.stdin!.write` calls behind a `!proc.killed && proc.stdin!.writable` check.
- **Sending requests before `initialized` notification:** The server rejects any method call until initialization completes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSONL framing/buffering | Custom byte accumulator | `node:readline` on `proc.stdout` | readline handles partial lines, backpressure, encoding correctly |
| JSON-RPC correlation | Custom protocol parser | Map of `pendingRequests: Map<number, callback>` | JSON-RPC IDs are sufficient; no protocol library needed for this use case |
| Codex thread persistence | Custom serialization | SQLite `codex_sessions` table (new, same DB) | Already have the DB connection; avoids filesystem state files |
| Approval timeout | Custom queue | Same `setTimeout` pattern as Claude hookServer | Proven approach from Phase 2 |

**Key insight:** The Codex adapter is structurally identical to the Claude adapter in terms of the eventBus integration — only the transport (stdio vs HTTP) and approval mechanism (stdin reply vs HTTP response) differ.

---

## Common Pitfalls

### Pitfall 1: Approval ID Mismatch (Integer vs UUID)

**What goes wrong:** The daemon generates a UUID `approvalId` for its internal approval system, but Codex uses an integer `id` for JSON-RPC correlation. Confusing these two causes the approval reply to never reach the Codex process.

**Why it happens:** The Codex `id` (integer) and our `approvalId` (UUID) are two different namespaces. The approval round-trip requires the Codex integer `id` to reply on stdin; the daemon's approval system tracks UUIDs.

**How to avoid:** Maintain two Maps: `pendingCodexApprovals: Map<number, { approvalId: string; timer }>` (keyed by Codex int id) and the standard `pendingEvents: Map<string, NormalizedEvent>` (keyed by UUID). The `resolveCodexApproval` function bridges them.

**Warning signs:** Codex process hangs waiting for approval reply; `proc.stdin.write` never called after browser decision.

### Pitfall 2: Process Exit Before Approval Reply Written

**What goes wrong:** The Codex process exits (crash, user interruption) while an approval is pending. Writing to `proc.stdin` after process exit throws `EPIPE`.

**Why it happens:** Node.js throws on writes to closed streams if not guarded.

**How to avoid:** Wrap stdin writes in `if (!proc.killed && proc.stdin?.writable)`. Handle `proc.on('exit')` and `proc.on('error')` to clean up pending approvals.

### Pitfall 3: Partial JSONL Lines

**What goes wrong:** Reading `proc.stdout` with `on('data')` gives partial lines when messages are large. Parsing partial JSON throws.

**Why it happens:** TCP/pipe delivery is byte-stream; a large message may arrive split across multiple `data` events.

**How to avoid:** Use `readline.createInterface` — it buffers internally and only emits complete lines.

### Pitfall 4: Missing `initialized` Notification

**What goes wrong:** Calling `thread/start` immediately after receiving the `initialize` response, without sending the `initialized` notification first. The server responds with "Not initialized."

**Why it happens:** The handshake requires both steps: response receipt + notification send.

**How to avoid:** Only send the `initialized` notification after the `initialize` response arrives with the correct `id`. Then transition adapter state to `ready` before sending any thread methods.

### Pitfall 5: `thread/resume` with Unknown threadId

**What goes wrong:** On daemon restart, the `codex_sessions` table has a `threadId` but Codex's on-disk thread storage was deleted or the Codex version changed. `thread/resume` returns an error response.

**Why it happens:** Codex persists threads to disk; if the JSONL files are deleted, the thread cannot be resumed.

**How to avoid:** On error response for `thread/resume`, fall back to `thread/start` (new session) and log a warning. Do not crash.

### Pitfall 6: Session Start Event Emitted for Every Turn

**What goes wrong:** Emitting `session_start` on every `turn/started` notification results in duplicate session_start events in the timeline.

**Why it happens:** Codex threads contain multiple turns; each turn starts/completes independently.

**How to avoid:** Track adapter state per session: emit `session_start` only once (on first `turn/started` or `thread/started`). Use a `boolean` flag `sessionStartEmitted` per adapter instance.

---

## Code Examples

### Spawning the App-Server and Reading JSONL

```typescript
// Source: https://developers.openai.com/codex/app-server + OpenAI official pattern
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';

const proc = spawn('codex', ['app-server'], {
  stdio: ['pipe', 'pipe', 'inherit'], // stdin writable, stdout readable, stderr passes through
  cwd: workspacePath,
});

const rl = readline.createInterface({ input: proc.stdout! });
let requestIdCounter = 1;

function write(obj: unknown): void {
  if (!proc.killed && proc.stdin?.writable) {
    proc.stdin.write(JSON.stringify(obj) + '\n');
  }
}

function nextId(): number { return requestIdCounter++; }

// Pending request callbacks: id → resolve function
const pendingRequests = new Map<number, (result: unknown) => void>();

rl.on('line', (line) => {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(line) as Record<string, unknown>;
  } catch (err) {
    eventBus.emit('event', {
      schemaVersion: 1, sessionId, timestamp: new Date().toISOString(),
      type: 'provider_parse_error', provider: 'codex',
      rawPayload: line, errorMessage: String(err),
    });
    return;
  }

  if ('id' in msg && 'result' in msg) {
    // Response to our request
    const cb = pendingRequests.get(msg['id'] as number);
    if (cb) { pendingRequests.delete(msg['id'] as number); cb(msg['result']); }
  } else if ('method' in msg && !('id' in msg)) {
    // Server notification
    handleNotification(msg['method'] as string, msg['params'] as Record<string, unknown>);
  } else if ('method' in msg && 'id' in msg) {
    // Server-initiated request (approval)
    handleServerRequest(msg['id'] as number, msg['method'] as string, msg['params'] as Record<string, unknown>);
  }
});
```

### Initialize Handshake

```typescript
// Source: https://developers.openai.com/codex/app-server
function initialize(): Promise<void> {
  return new Promise((resolve) => {
    const id = nextId();
    pendingRequests.set(id, () => {
      // Send initialized notification after response received
      write({ method: 'initialized', params: {} });
      resolve();
    });
    write({
      method: 'initialize', id,
      params: {
        clientInfo: { name: 'cockpit-daemon', title: 'Agent Cockpit', version: '0.1.0' },
        capabilities: { experimentalApi: true },
      },
    });
  });
}
```

### Thread Start and Session ID Persistence

```typescript
// Source: derived from https://developers.openai.com/codex/app-server protocol
function startThread(db: Database, sessionId: string, workspacePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = nextId();
    pendingRequests.set(id, (result) => {
      const threadId = (result as { thread: { id: string } }).thread.id;
      // Persist to SQLite for resume support
      db.prepare(`INSERT INTO codex_sessions (session_id, thread_id, workspace, created_at)
                  VALUES (?, ?, ?, ?)`).run(sessionId, threadId, workspacePath, new Date().toISOString());
      resolve(threadId);
    });
    write({ method: 'thread/start', id, params: { cwd: workspacePath, approvalPolicy: 'on-action' } });
  });
}
```

### Approval Reply to Server-Initiated Request

```typescript
// Source: https://developers.openai.com/codex/app-server approval format
// serverId = integer id from Codex's requestApproval message
function replyApproval(serverId: number, decision: 'accept' | 'acceptForSession' | 'decline'): void {
  write({ id: serverId, result: { decision } });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TypeScript `codex-cli` (Node wrapper) | Rust `codex-rs` binary with `codex app-server` | April 2025 → 2026 | Rust binary is the canonical runtime; TypeScript CLI is a thin launcher |
| Custom event formats | JSON-RPC lite over JSONL (stdio) | Early 2025 | Stable protocol now used by VS Code extension, web app, CLI |

**Deprecated/outdated:**
- The legacy TypeScript `codex-cli` package: still ships as a wrapper but all active development is in `codex-rs`. Any documentation predating `app-server` refers to a now-legacy integration pattern.

---

## Open Questions

1. **`approvalPolicy` value for `thread/start`**
   - What we know: The field is documented; values include `never`, `on-action`, and potentially others
   - What's unclear: Whether the daemon should set `on-action` (require human approval for commands/file changes) or expose it as a user preference
   - Recommendation: Default to `on-action` in Phase 4 to ensure approval events flow through the daemon. Expose as a future config option.

2. **Codex binary availability on PATH**
   - What we know: `codex app-server` must be installed separately; the daemon spawns it as a child process
   - What's unclear: Whether the daemon should fail hard or soft when `codex` is not on PATH
   - Recommendation: Handle `ENOENT` from `spawn` gracefully — emit a log error, do not crash the daemon, return a 503 from `POST /api/sessions` for Codex provider.

3. **Persistence location of Codex thread JSONL files**
   - What we know: Codex stores threads as JSONL files on disk; location is opaque to our adapter
   - What's unclear: Whether the location is configurable or fixed
   - Recommendation: Treat as a black box; rely on `thread/list` for discovery, not filesystem scanning.

---

## Validation Architecture

> `nyquist_validation` is enabled in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `packages/daemon/vitest.config.ts` |
| Quick run command | `pnpm --filter @cockpit/daemon test --run` |
| Full suite command | `pnpm --filter @cockpit/daemon test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DAEMON-05 | Codex JSONL parser maps `turn/started` → `session_start` | unit | `pnpm --filter @cockpit/daemon test --run codexParser` | Wave 0 |
| DAEMON-05 | Codex JSONL parser maps `item/started` (commandExecution) → `tool_call` | unit | `pnpm --filter @cockpit/daemon test --run codexParser` | Wave 0 |
| DAEMON-05 | Codex JSONL parser maps `item/commandExecution/requestApproval` → `approval_request` | unit | `pnpm --filter @cockpit/daemon test --run codexParser` | Wave 0 |
| DAEMON-05 | Malformed JSONL line → `provider_parse_error` event, no crash | unit | `pnpm --filter @cockpit/daemon test --run codexParser` | Wave 0 |
| DAEMON-05 | Codex adapter replies correct `{ id, result: { decision } }` on approval | unit | `pnpm --filter @cockpit/daemon test --run codexAdapter` | Wave 0 |
| DAEMON-05 | Session resume: `thread/resume` called with persisted threadId on restart | unit | `pnpm --filter @cockpit/daemon test --run codexAdapter` | Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @cockpit/daemon test --run`
- **Per wave merge:** `pnpm --filter @cockpit/daemon test --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/daemon/src/adapters/codex/__tests__/codexParser.test.ts` — covers JSONL → NormalizedEvent mapping (DAEMON-05)
- [ ] `packages/daemon/src/adapters/codex/__tests__/codexAdapter.test.ts` — covers approval reply, parse error resilience, session resume (DAEMON-05)
- [ ] `packages/daemon/src/db/database.ts` migration — `codex_sessions` table DDL must be added to the existing `db.exec()` schema block

*(Framework is already configured — no new test infrastructure needed)*

---

## Sources

### Primary (HIGH confidence)

- [App Server – Codex | OpenAI Developers](https://developers.openai.com/codex/app-server) — full protocol specification, all method shapes, approval format, JSONL framing, handshake sequence
- [codex/codex-rs/app-server/README.md at main · openai/codex](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md) — canonical implementation README: startup, JSONL, resume, process lifecycle warnings

### Secondary (MEDIUM confidence)

- [OpenAI Codex App Server Architecture - InfoQ](https://www.infoq.com/news/2026/02/opanai-codex-app-server/) — architecture overview corroborating official docs (verified with official source)
- WebSearch: `spawn`/`readline` pattern — confirmed against official docs pattern above

### Tertiary (LOW confidence)

- [codex app-server approval response issue #14192](https://github.com/openai/codex/issues/14192) — community issue about strict approval response RPC; not authoritative but corroborates approval ID matching behavior

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Node built-ins only; no new packages; verified against official docs
- Architecture: HIGH — Protocol fully documented at developers.openai.com; approval round-trip verified
- Pitfalls: MEDIUM — Approval ID mismatch, partial lines, process exit guard are all engineering fundamentals; `thread/resume` fallback is inferred from documented error behavior

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (protocol changes infrequently; Codex `app-server` API is stable)
