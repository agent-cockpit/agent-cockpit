# Phase 2: Claude Adapter + Approval Foundation - Research

**Researched:** 2026-04-05
**Domain:** Claude Code hooks HTTP server, approval round-trip, timeout auto-deny, browser notifications
**Confidence:** HIGH

---

## Summary

Phase 2 has three distinct engineering problems: (1) receiving lifecycle hook events from Claude Code via HTTP and converting them into `NormalizedEvent` objects the existing `eventBus` can accept; (2) implementing the approval round-trip — Claude Code posts a `PreToolUse` or `PermissionRequest` hook event, the daemon holds the HTTP response open, the browser decides, and the daemon replies with the correct JSON decision envelope; and (3) firing in-app and OS-level browser notifications when an approval arrives.

The foundation built in Phase 1 makes this straightforward: `eventBus.emit('event', normalized)` is all an adapter needs to call. The hook HTTP server is a separate HTTP listener (distinct from the WebSocket port) that Claude Code POSTs to. For the approval round-trip, the server holds the Node.js `http.ServerResponse` object in a Map keyed by `approvalId` and resolves it when the browser sends a decision over the existing WebSocket channel.

Timeout auto-deny is implemented with `setTimeout` per pending approval: when it fires, if the response is still in the Map, the daemon replies `permissionDecision: "deny"`, emits an `approval_expired` event, and removes the entry. There is no deadlock risk because the response object is held in memory and Node.js timers are non-blocking.

Browser notifications use the standard `Notification` API: `Notification.requestPermission()` once on app load, then `new Notification(...)` gated on `document.visibilityState === "hidden"` for OS-level alerts. In-app notifications come from the Zustand store (or a toast library) reacting to `approval_request` events from the WebSocket.

**Primary recommendation:** Implement the hook HTTP server as a second HTTP server on a dedicated port (default `3002`, env var `COCKPIT_HOOK_PORT`). Hold `ServerResponse` objects in a `Map<approvalId, { res, timer }>`. Wire the WebSocket `message` handler (Phase 1 left it as a no-op) to parse incoming approval decisions and look them up in the Map.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DAEMON-04 | Claude adapter ingesting lifecycle hooks via HTTP: session start/stop, tool calls, file changes, permission requests, subagent events, memory read/write | Claude Code docs confirm HTTP hooks POST JSON with `session_id`, `hook_event_name`, `tool_name`, `tool_input`; map directly to existing `NormalizedEvent` types in `@cockpit/shared` |
| APPR-01 | Single unified approval inbox for pending approvals | `ApprovalRequestEvent` already in schema; daemon stores pending approvals in SQLite `approvals` table (new) and emits via WebSocket |
| APPR-02 | Each approval classified by type (shell/file/network/MCP/sandbox/user-input) and risk level | `actionType` and `riskLevel` fields already in `ApprovalRequestEvent`; adapter derives them from `tool_name` + `tool_input` heuristics |
| APPR-03 | Approve once, deny once, or always-allow per approval | Three decision values map to `approved`, `denied`, `always_allow` in `ApprovalResolvedEvent.decision`; `always_allow` stored in `always_allow_rules` table |
| APPR-04 | Inspect detail: proposed action, reason, affected files, "why risky" hint, last related event | `proposedAction`, `affectedPaths`, `whyRisky` already in `ApprovalRequestEvent`; last related event lookup by `sessionId` order |
| APPR-05 | Auto-deny after timeout, emit `approval_expired`, no agent deadlock | `setTimeout` per pending entry in Map; on fire: reply with `permissionDecision: "deny"`, emit `ApprovalResolvedEvent` with `decision: "timeout"`, remove from Map |
| APPR-06 | All approval decisions persisted and visible in session history | Insert into `approvals` table on each decision; `ApprovalResolvedEvent` also persisted in `events` table via `eventBus` |
| NOTIF-01 | In-app notification when approval needed / session fails / completes | React to `approval_request` WebSocket events in a Zustand slice; render a toast/badge in UI |
| NOTIF-02 | Desktop OS-level notification when browser tab is in background | `Notification` Web API; gate on `document.visibilityState === "hidden"`; request permission once on app load via user gesture |
</phase_requirements>

---

## Standard Stack

### Core (new additions for Phase 2)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `node:http` | built-in | Hook HTTP server (separate from WS port) | No extra dependency; `createServer` is sufficient for a simple POST endpoint |
| better-sqlite3 | 12.8.0 (existing) | Persist approvals table + always_allow_rules | Already in the project; synchronous API matches the event pipeline |
| Web Notifications API | browser built-in | OS-level desktop notifications | No library needed; standard browser API, works on localhost in modern browsers |

### No New npm Dependencies Required

Phase 2 extends the existing stack. The hook HTTP server uses Node.js built-in `http`. No Express or Fastify is needed — the endpoint surface is a single `POST /hook` route.

### If a Lightweight HTTP Framework is Desired

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| express | 4.x | Route handling, body parsing | Only if the hook server grows beyond 1-2 routes; not recommended for Phase 2 |

**Installation (no new packages needed):**
```bash
# Phase 2 uses only existing packages + Node built-ins
# pnpm add is not required
```

---

## Claude Code Hooks — Complete Reference

### Hook Types Relevant to Phase 2

| Hook Event | Fires When | Maps To |
|-----------|-----------|---------|
| `SessionStart` | New or resumed session | `session_start` NormalizedEvent |
| `SessionEnd` | Session terminates | `session_end` NormalizedEvent |
| `PreToolUse` | Before any tool executes — **BLOCKING** | `approval_request` (if high-risk) or `tool_call` (pass-through) |
| `PostToolUse` | After successful tool execution | `tool_call` NormalizedEvent (update/completion) |
| `PermissionRequest` | Claude Code needs explicit permission | `approval_request` NormalizedEvent |
| `Notification` | Claude Code fires a notification | `tool_call` or pass-through informational event |
| `SubagentStart` | A subagent spawns | `subagent_spawn` NormalizedEvent |
| `SubagentStop` | A subagent completes | `subagent_complete` NormalizedEvent |

### Hook HTTP Input Payload (what Claude Code POSTs)

All hooks send a POST with `Content-Type: application/json`. Common fields:

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.claude/projects/.../transcript.jsonl",
  "cwd": "/Users/my-project",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "rm -rf /tmp/test" },
  "tool_use_id": "toolu_01ABC123..."
}
```

### PreToolUse Response Envelope (for approval decisions)

Claude Code WAITS synchronously for the HTTP response before proceeding. The response must be 2xx JSON:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Denied by user in cockpit"
  }
}
```

Valid `permissionDecision` values:
- `"allow"` — proceed without user prompt
- `"deny"` — prevent the tool call; Claude Code sees this as a rejection
- `"ask"` — prompt user in Claude Code terminal
- `"defer"` — exit gracefully (for `-p` flag integrations; not needed here)

**Critical:** Non-2xx responses, connection failures, and HTTP hook timeouts are **non-blocking** — Claude Code continues as if the hook never fired. You MUST return 2xx with the decision JSON to actually control behavior.

### PermissionRequest Response Envelope

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "deny"
    }
  }
}
```

### Hook Configuration in ~/.claude/settings.json

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:3002/hook",
            "timeout": 300
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:3002/hook",
            "timeout": 300
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:3002/hook",
            "timeout": 30
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:3002/hook",
            "timeout": 30
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:3002/hook",
            "timeout": 30
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:3002/hook",
            "timeout": 30
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:3002/hook",
            "timeout": 30
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:3002/hook",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

**Important:** The `PreToolUse` and `PermissionRequest` hooks use `timeout: 300` (5 minutes) so Claude Code waits for a human decision. The hook server's internal approval timeout (default 60 seconds) fires first and auto-denies before the Claude Code HTTP timeout expires.

---

## Architecture Patterns

### Recommended Project Structure Addition

```
packages/daemon/src/
├── adapters/
│   └── claude/
│       ├── hookServer.ts       # HTTP server on COCKPIT_HOOK_PORT (3002)
│       ├── hookParser.ts       # raw payload → NormalizedEvent mapping
│       └── riskClassifier.ts  # tool_name + tool_input → actionType + riskLevel
├── approvals/
│   ├── approvalQueue.ts        # Map<approvalId, PendingApproval> in-memory
│   ├── approvalStore.ts        # SQLite approvals + always_allow_rules tables
│   └── timeoutManager.ts      # setTimeout per approval, auto-deny on fire
├── db/
│   ├── database.ts             # (existing) — add approvals schema migration
│   └── queries.ts              # (existing) — add approval insert/update queries
├── ws/
│   └── handlers.ts             # (existing) — wire ws.on('message') for decisions
└── index.ts                    # (existing) — register hookServer, approvalQueue
```

### Pattern 1: Hook Server — Hold Response for Approval

**What:** The hook HTTP server receives a `PreToolUse` POST. For high-risk tools, it stores the `ServerResponse` object in a Map and returns immediately without calling `res.end()`. The response stays open. When the browser sends a decision, the daemon calls `res.end(JSON.stringify(decisionEnvelope))`.

**Why this works:** Node.js HTTP `ServerResponse` objects are just writable streams. They do not close until `res.end()` or `res.destroy()` is called. Claude Code WAITS for the response.

```typescript
// Source: Node.js http docs + hooks reference
// packages/daemon/src/adapters/claude/hookServer.ts

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

interface PendingApproval {
  res: ServerResponse;
  timer: ReturnType<typeof setTimeout>;
  hookEventName: string;
}

const pendingApprovals = new Map<string, PendingApproval>();

const APPROVAL_TIMEOUT_MS = parseInt(process.env['COCKPIT_APPROVAL_TIMEOUT_MS'] ?? '60000', 10);

export function createHookServer(
  port: number,
  onEvent: (raw: HookPayload) => void,
  onDecisionNeeded: (approvalId: string, payload: HookPayload) => void,
  onAutoDecide: (approvalId: string) => void,
): ReturnType<typeof createServer> {
  const server = createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let payload: HookPayload;
      try {
        payload = JSON.parse(body) as HookPayload;
      } catch {
        res.writeHead(400).end();
        return;
      }

      const isApprovalHook =
        payload.hook_event_name === 'PreToolUse' ||
        payload.hook_event_name === 'PermissionRequest';

      if (isApprovalHook && requiresHumanApproval(payload)) {
        const approvalId = randomUUID();
        const timer = setTimeout(() => {
          autoDecide(approvalId, 'timeout');
        }, APPROVAL_TIMEOUT_MS);

        pendingApprovals.set(approvalId, { res, timer, hookEventName: payload.hook_event_name });
        onDecisionNeeded(approvalId, payload);
        // res is intentionally NOT ended here — Claude Code waits
      } else {
        // Fire-and-forget hooks: process event, respond immediately
        onEvent(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({}));
      }
    });
  });

  server.listen(port);
  return server;
}

export function resolveApproval(
  approvalId: string,
  decision: 'allow' | 'deny' | 'always_allow',
  reason?: string,
): void {
  const pending = pendingApprovals.get(approvalId);
  if (!pending) return; // already resolved (race condition guard)

  clearTimeout(pending.timer);
  pendingApprovals.delete(approvalId);

  const permissionDecision = decision === 'always_allow' ? 'allow' : decision;
  const envelope = buildResponseEnvelope(pending.hookEventName, permissionDecision, reason);

  pending.res.writeHead(200, { 'Content-Type': 'application/json' });
  pending.res.end(JSON.stringify(envelope));
}

function autoDecide(approvalId: string, reason: 'timeout'): void {
  const pending = pendingApprovals.get(approvalId);
  if (!pending) return;

  pendingApprovals.delete(approvalId);
  const envelope = buildResponseEnvelope(pending.hookEventName, 'deny', 'Auto-denied: timeout exceeded');
  pending.res.writeHead(200, { 'Content-Type': 'application/json' });
  pending.res.end(JSON.stringify(envelope));
  // Caller emits approval_expired event
}

function buildResponseEnvelope(hookEventName: string, permissionDecision: string, reason?: string) {
  if (hookEventName === 'PreToolUse') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision,
        ...(reason ? { permissionDecisionReason: reason } : {}),
      },
    };
  }
  // PermissionRequest
  return {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: permissionDecision },
    },
  };
}
```

### Pattern 2: WebSocket Message Handler for Decisions

**What:** The WebSocket `message` handler (Phase 1 left it as a no-op) now parses incoming JSON messages from the browser. An approval decision message triggers `resolveApproval()`.

```typescript
// Source: existing ws/handlers.ts pattern — extend ws.on('message')
// Browser sends: { "type": "approval_decision", "approvalId": "...", "decision": "approve" | "deny" | "always_allow" }

ws.on('message', (data) => {
  let msg: unknown;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    return; // ignore malformed messages
  }

  const parsed = InboundMessageSchema.safeParse(msg);
  if (!parsed.success) return;

  if (parsed.data.type === 'approval_decision') {
    const { approvalId, decision } = parsed.data;
    resolveApproval(approvalId, decision);
    // approvalQueue emits approval_resolved event via eventBus
  }
});
```

### Pattern 3: Hook Payload → NormalizedEvent Mapping

**What:** The hook parser translates Claude Code's snake_case payload to the `NormalizedEvent` union defined in `@cockpit/shared`.

Key mapping rules:
- `session_id` → `sessionId` (generate a UUID from the session_id string deterministically or use it directly if already UUID-shaped)
- `hook_event_name: "SessionStart"` → `type: "session_start"`, `provider: "claude"`, `workspacePath: payload.cwd`
- `hook_event_name: "PreToolUse"` (pass-through, not blocked) → `type: "tool_call"`, `toolName: payload.tool_name`, `input: payload.tool_input`
- `hook_event_name: "PreToolUse"` (approval needed) → `type: "approval_request"`, classify risk from `tool_name` + `tool_input`
- `hook_event_name: "PostToolUse"` → `type: "tool_call"` (tool completed successfully)
- `hook_event_name: "SubagentStart"` → `type: "subagent_spawn"`, `subagentSessionId: payload.agent_id`
- `hook_event_name: "SubagentStop"` → `type: "subagent_complete"`, `success: true`

**session_id note:** Claude Code's `session_id` is a short string (e.g., `"abc123"`), NOT a UUID. The adapter must either store a mapping table or generate a deterministic UUID from it (e.g., `uuid5(NAMESPACE, session_id)`). The `NormalizedEvent` schema requires `sessionId: z.string().uuid()`. Use `uuid` package or `node:crypto.randomUUID()` with a stable map.

### Pattern 4: Risk Classification

**What:** Derives `actionType` and `riskLevel` from `tool_name` and `tool_input`.

```typescript
// packages/daemon/src/adapters/claude/riskClassifier.ts
type ActionType = 'shell_command' | 'file_change' | 'network_access' | 'sandbox_escalation' | 'mcp_tool_call' | 'user_input';
type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export function classifyRisk(toolName: string, toolInput: Record<string, unknown>): {
  actionType: ActionType;
  riskLevel: RiskLevel;
  whyRisky: string;
} {
  if (toolName === 'Bash') {
    const cmd = String(toolInput['command'] ?? '');
    if (/rm\s+-rf|sudo|chmod 777|curl.*\|.*sh/.test(cmd)) {
      return { actionType: 'shell_command', riskLevel: 'critical', whyRisky: 'Destructive or privilege-escalating shell command' };
    }
    if (/curl|wget|ssh|git push|npm publish/.test(cmd)) {
      return { actionType: 'network_access', riskLevel: 'high', whyRisky: 'Network-bound command' };
    }
    return { actionType: 'shell_command', riskLevel: 'medium', whyRisky: 'Shell command execution' };
  }
  if (toolName === 'Write' || toolName === 'Edit') {
    return { actionType: 'file_change', riskLevel: 'low', whyRisky: 'File modification' };
  }
  // MCP tools have non-standard names; anything not in the built-in list is MCP
  const builtInTools = ['Bash', 'Write', 'Edit', 'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Agent', 'AskUserQuestion'];
  if (!builtInTools.includes(toolName)) {
    return { actionType: 'mcp_tool_call', riskLevel: 'medium', whyRisky: `MCP tool: ${toolName}` };
  }
  return { actionType: 'shell_command', riskLevel: 'low', whyRisky: 'Standard tool use' };
}
```

### Pattern 5: SQLite Approvals Table

**What:** New table in the existing database for persisted approval state. Added as a migration in `database.ts`.

```typescript
// Extend existing db.exec() in database.ts
db.exec(`
  CREATE TABLE IF NOT EXISTS approvals (
    approval_id     TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|denied|always_allow|timeout
    action_type     TEXT NOT NULL,
    risk_level      TEXT NOT NULL,
    proposed_action TEXT NOT NULL,
    affected_paths  TEXT,         -- JSON array string
    why_risky       TEXT,
    created_at      TEXT NOT NULL,
    decided_at      TEXT,
    decision_reason TEXT
  );

  CREATE TABLE IF NOT EXISTS always_allow_rules (
    id              INTEGER PRIMARY KEY,
    session_id      TEXT NOT NULL,
    tool_name       TEXT NOT NULL,
    pattern         TEXT NOT NULL,   -- command pattern or file glob
    created_at      TEXT NOT NULL
  );
`);
```

### Pattern 6: Browser Notifications

**What:** Standard Web Notifications API. No library needed.

```typescript
// Source: MDN Notifications API
// Request permission once (must be called from a user gesture handler)
async function requestNotificationPermission(): Promise<void> {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

// Fire an OS notification if the tab is in the background
function notifyIfBackground(title: string, body: string): void {
  if (Notification.permission !== 'granted') return;
  if (document.visibilityState === 'hidden') {
    new Notification(title, { body, icon: '/icon-128.png' });
  }
}

// Usage in WebSocket message handler:
// onmessage: if event.type === 'approval_request':
//   notifyIfBackground('Approval needed', event.proposedAction)
```

**Localhost note:** Modern browsers (Chrome, Firefox, Safari) allow `Notification.requestPermission()` on `http://localhost` even without HTTPS. This is a documented secure-context exception for development.

### Anti-Patterns to Avoid

- **Using a long HTTP timeout on Claude Code side to "hold" the connection:** Claude Code's HTTP hook timeout is configurable; set it to 300s. But the daemon must reply within its own approval timeout (e.g., 60s) to auto-deny before Claude Code times out. Never rely on the Claude Code timeout as the auto-deny mechanism.
- **Storing `ServerResponse` in SQLite:** `ServerResponse` is an in-memory stream handle. Persisting the approval decision in SQLite is correct; the live response object lives only in the in-memory Map.
- **Generating a new UUID per hook call for `sessionId`:** Claude Code's `session_id` is stable across the session. The adapter must map the same `session_id` string to the same UUID consistently, otherwise events from the same session get different `sessionId` values. Use a `Map<string, string>` session ID cache or a deterministic UUID v5 derivation.
- **Blocking the Node.js event loop in the hook handler:** Never use `better-sqlite3` synchronous writes inside the HTTP `data` event — do all SQLite writes after `req.on('end', ...)` to ensure the full body is parsed first.
- **Sending OS notifications in the foreground:** Always gate `new Notification()` on `document.visibilityState === 'hidden'`. Foreground notifications are handled in-app (toast/badge).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP body parsing | Manual chunk accumulation | Already shown in Pattern 1 — it's ~5 lines; no need for body-parser npm package | The hook server has exactly one endpoint; full Express body-parser is overkill |
| Approval ID generation | Custom ID scheme | `node:crypto.randomUUID()` | Cryptographically unique, collision-free, already in Node.js built-ins |
| Risk classification ML | LLM-based risk scoring | Simple regex/allowlist heuristics in `riskClassifier.ts` | Phase 2 heuristics are good enough; AUTO-01 (policy rules) is v2 scope |
| Desktop notification library | `react-notification`, `notistack` | Native `Notification` Web API | Zero deps, works on localhost, no service worker needed |
| Approval timeout scheduler | `node-cron`, `agenda`, `bull` | Plain `setTimeout` per approval | Single-process daemon, no persistence needed for the timer itself; if daemon restarts, in-flight approvals are lost anyway |
| Session UUID mapping | UUID v5 with crypto | Simple `Map<string, string>` populated on first `session_id` seen | UUID v5 adds a dependency (`uuid` package) and the session cache only lives for the daemon's process lifetime anyway |

---

## Common Pitfalls

### Pitfall 1: Claude Code HTTP Timeout < Daemon Auto-Deny Timeout
**What goes wrong:** The daemon's auto-deny fires at 60s, but Claude Code's HTTP hook `timeout` field is set to 30s. Claude Code disconnects at 30s (non-blocking error — execution continues without the deny), then the daemon tries to `res.end()` on a closed connection and throws.
**Why it happens:** Mismatched timeout values.
**How to avoid:** Set Claude Code's hook `timeout` to 300 seconds (5 minutes). Set the daemon's auto-deny to 60 seconds. The daemon ALWAYS fires before Claude Code gives up. Always check `res.writableEnded` before calling `res.end()`.
**Warning signs:** "Write after end" or "Cannot set headers after they are sent" errors in the daemon log.

### Pitfall 2: `session_id` Is Not a UUID
**What goes wrong:** Claude Code's `session_id` (e.g., `"abc123"`) is passed directly to `NormalizedEvent.sessionId`, which is `z.string().uuid()`. Zod validation rejects the event.
**Why it happens:** The `NormalizedEvent` schema requires a UUID; Claude Code provides a short opaque string.
**How to avoid:** The hook parser maintains a `Map<string, string>` session cache. On first sight of a `session_id`, generate `randomUUID()` and store the mapping. All subsequent events from the same Claude Code session use the same UUID.
**Warning signs:** Zod `safeParse` failures with "invalid_string" on `sessionId`.

### Pitfall 3: Approval Response Sent Twice (Race Condition)
**What goes wrong:** The browser sends a decision at the same moment the daemon's `setTimeout` fires. Both call `resolveApproval(approvalId)`. The second call tries to `res.end()` on an already-ended response.
**Why it happens:** The Map lookup and `res.end()` are not atomic.
**How to avoid:** `pendingApprovals.delete(approvalId)` BEFORE calling `res.end()`. Check `res.writableEnded` before writing. Or: delete from Map first, clear timer, then write to response — the delete serves as the "claim" in a single-threaded process.
**Warning signs:** "Cannot call write after a stream has been destroyed" in the daemon log.

### Pitfall 4: ApprovalRequestEvent Emitted Before SQLite Insert
**What goes wrong:** The daemon emits `approval_request` via WebSocket broadcast. The browser receives it and immediately sends back a decision. The daemon tries to update the `approvals` row but it hasn't been inserted yet because `persistEvent` hasn't run yet.
**Why it happens:** Asynchronous event ordering — the emit happens before the persist.
**How to avoid:** Insert into `approvals` table SYNCHRONOUSLY (better-sqlite3 is sync) BEFORE emitting the event on `eventBus`. The event broadcast goes out only after the row exists.
**Warning signs:** SQLite "FOREIGN KEY constraint" or "row not found" errors on decision update.

### Pitfall 5: Notification Permission Requested Without User Gesture
**What goes wrong:** `Notification.requestPermission()` is called on app load without a user gesture. Chrome (v74+) silently denies the request or shows a blocked indicator. The permission stays `"default"` or becomes `"denied"`.
**Why it happens:** Browsers block permission prompts not triggered by user interaction.
**How to avoid:** Wire `requestNotificationPermission()` to a user-visible "Enable notifications" button or to the first approval-needed event click. Never call it on mount automatically.
**Warning signs:** `Notification.permission` returns `"denied"` even after calling `requestPermission()`.

### Pitfall 6: Hook Server Port Conflict With WebSocket Server
**What goes wrong:** The hook server and WebSocket server both try to bind to the same port.
**Why it happens:** Copy-paste of the `COCKPIT_WS_PORT` env var.
**How to avoid:** Use a distinct port for the hook server (`COCKPIT_HOOK_PORT`, default `3002`). The WS server uses `COCKPIT_WS_PORT` (default `3001`). Document both in the daemon startup log line.
**Warning signs:** `EADDRINUSE` error on daemon start.

---

## Code Examples

Verified patterns from official sources:

### Claude Code Hook Input → NormalizedEvent (SessionStart)
```typescript
// Source: Claude Code hooks reference (code.claude.com/docs/en/hooks)
// packages/daemon/src/adapters/claude/hookParser.ts

import { randomUUID } from 'node:crypto';
import type { NormalizedEvent } from '@cockpit/shared';

const sessionIdCache = new Map<string, string>();

function getOrCreateSessionUUID(claudeSessionId: string): string {
  let uuid = sessionIdCache.get(claudeSessionId);
  if (!uuid) {
    uuid = randomUUID();
    sessionIdCache.set(claudeSessionId, uuid);
  }
  return uuid;
}

export function parseHookPayload(raw: HookPayload): NormalizedEvent | null {
  const sessionId = getOrCreateSessionUUID(raw.session_id);
  const timestamp = new Date().toISOString();

  switch (raw.hook_event_name) {
    case 'SessionStart':
      return {
        schemaVersion: 1,
        type: 'session_start',
        sessionId,
        timestamp,
        provider: 'claude',
        workspacePath: raw.cwd,
      };
    case 'SessionEnd':
      return {
        schemaVersion: 1,
        type: 'session_end',
        sessionId,
        timestamp,
        provider: 'claude',
        exitCode: undefined,
      };
    case 'PostToolUse':
      return {
        schemaVersion: 1,
        type: 'tool_call',
        sessionId,
        timestamp,
        toolName: raw.tool_name ?? 'unknown',
        input: raw.tool_input ?? {},
      };
    // PreToolUse pass-through (non-blocked):
    case 'PreToolUse':
      return {
        schemaVersion: 1,
        type: 'tool_call',
        sessionId,
        timestamp,
        toolName: raw.tool_name ?? 'unknown',
        input: raw.tool_input ?? {},
      };
    default:
      return null;
  }
}
```

### Sending a Decision From the Browser via WebSocket
```typescript
// Source: existing WebSocket protocol (ws/handlers.ts Phase 1 pattern)
// Browser-side:
ws.send(JSON.stringify({
  type: 'approval_decision',
  approvalId: 'uuid-of-approval',
  decision: 'approve',  // 'approve' | 'deny' | 'always_allow'
  reason: 'Looks safe',
}));
```

### Auto-Deny on Timeout With Event Emission
```typescript
// packages/daemon/src/adapters/claude/hookServer.ts
function autoDecide(approvalId: string, sessionId: string): void {
  const pending = pendingApprovals.get(approvalId);
  if (!pending) return; // already resolved

  // Remove BEFORE res.end() to prevent race
  pendingApprovals.delete(approvalId);

  // Reply to Claude Code
  const envelope = buildResponseEnvelope(pending.hookEventName, 'deny', 'Auto-denied: timeout exceeded');
  if (!pending.res.writableEnded) {
    pending.res.writeHead(200, { 'Content-Type': 'application/json' });
    pending.res.end(JSON.stringify(envelope));
  }

  // Emit approval_expired via eventBus
  eventBus.emit('event', {
    schemaVersion: 1,
    type: 'approval_resolved',
    sessionId,
    timestamp: new Date().toISOString(),
    approvalId,
    decision: 'timeout',
  });
}
```

### Browser Notification Gated on Tab Visibility
```typescript
// Source: MDN Notifications API (developer.mozilla.org/en-US/docs/Web/API/Notifications_API)
// packages/browser/src/notifications.ts

export function showApprovalNotification(proposedAction: string): void {
  if (Notification.permission !== 'granted') return;
  if (document.visibilityState !== 'hidden') return; // in-app toast handles foreground

  new Notification('Approval needed', {
    body: proposedAction,
    icon: '/icon-128.png',
    requireInteraction: true, // stays until dismissed
  });
}

export async function requestNotificationPermission(): Promise<void> {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Claude Code hooks via command scripts only | HTTP hooks added as first-class type | 2024–2025 | Server can receive structured JSON directly without shell script wrappers |
| PreToolUse used top-level `decision` field | `hookSpecificOutput.permissionDecision` (nested) | Late 2024 | Must use nested structure; top-level `decision` for PostToolUse/Stop still valid |
| Shell command hooks for observability | HTTP hooks POST JSON directly to local server | Current | Much cleaner than piping stdin/stdout through shell scripts |

**Deprecated/outdated:**
- Top-level `decision` field for `PreToolUse`: use `hookSpecificOutput.permissionDecision` instead. Top-level `decision` is still valid for `PostToolUse` and `Stop` hooks.
- Command-based hooks for structured data: HTTP hooks are preferable for server integration.

---

## Open Questions

1. **Session ID: cache vs deterministic UUID v5**
   - What we know: Claude Code `session_id` is a short string, `NormalizedEvent.sessionId` requires UUID
   - What's unclear: Should the cache be persisted to SQLite (survives daemon restart) or in-memory only?
   - Recommendation: In-memory `Map` for Phase 2. If the daemon restarts mid-session, new UUID is assigned — acceptable for Phase 2. Phase 3+ can add SQLite persistence of the `session_id → uuid` mapping.

2. **`requiresHumanApproval` heuristic threshold**
   - What we know: `PreToolUse` fires for ALL tools including low-risk reads. Blocking on every `Read` call would be unusable.
   - What's unclear: Which tools should block for approval vs pass through silently?
   - Recommendation: Default policy — only block `Bash` commands matching a risk pattern and any `PermissionRequest` event. Pass through `Read`, `Glob`, `Grep`, `WebSearch`, and file-writing tools silently. This can be configured in v2 (AUTO-01).

3. **`always_allow` scope: session vs global**
   - What we know: APPR-03 says "always-allow a similar action within the session"
   - What's unclear: "Within the session" means the `always_allow_rules` table is scoped by `session_id` — rules don't carry over between sessions
   - Recommendation: Scope `always_allow_rules` to `session_id`. Global allow policies are v2 scope (AUTO-01).

4. **File-change events from PostToolUse**
   - What we know: `Write` and `Edit` tools modify files; their `PostToolUse` payload contains `file_path` and `content`/`old_string`/`new_string`
   - What's unclear: Should `PostToolUse` for Write/Edit emit `file_change` events instead of `tool_call` events?
   - Recommendation: Emit `file_change` NormalizedEvent for Write/Edit `PostToolUse` hooks. This populates the Phase 6 diff view correctly. Map `Write` → `changeType: "created"` or `"modified"` based on whether the file existed; `Edit` → `"modified"`.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (existing) |
| Config file | `packages/daemon/vitest.config.ts` (existing) |
| Quick run command | `pnpm --filter @cockpit/daemon test run` |
| Full suite command | `pnpm test run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DAEMON-04 | `parseHookPayload` maps `SessionStart` payload to `session_start` NormalizedEvent | unit | `pnpm --filter @cockpit/daemon test run` | Wave 0 |
| DAEMON-04 | `parseHookPayload` maps `PreToolUse` payload to `tool_call` NormalizedEvent | unit | `pnpm --filter @cockpit/daemon test run` | Wave 0 |
| DAEMON-04 | `parseHookPayload` maps `SubagentStart` to `subagent_spawn` | unit | `pnpm --filter @cockpit/daemon test run` | Wave 0 |
| DAEMON-04 | Hook server receives POST, emits on eventBus, persists to SQLite within 1 second | integration | `pnpm --filter @cockpit/daemon test run` | Wave 0 |
| APPR-01 | `createHookServer` with blocking `PreToolUse` keeps response open (does not call `res.end()` immediately) | integration | `pnpm --filter @cockpit/daemon test run` | Wave 0 |
| APPR-02 | `classifyRisk('Bash', { command: 'rm -rf /' })` returns `riskLevel: 'critical'` | unit | `pnpm --filter @cockpit/daemon test run` | Wave 0 |
| APPR-02 | `classifyRisk('Read', { file_path: '/tmp/x' })` returns `riskLevel: 'low'` | unit | `pnpm --filter @cockpit/daemon test run` | Wave 0 |
| APPR-03 | `resolveApproval(id, 'approve')` ends the held response with `permissionDecision: "allow"` | integration | `pnpm --filter @cockpit/daemon test run` | Wave 0 |
| APPR-03 | `resolveApproval(id, 'deny')` ends the held response with `permissionDecision: "deny"` | integration | `pnpm --filter @cockpit/daemon test run` | Wave 0 |
| APPR-04 | Persisted approval row in SQLite contains `proposed_action`, `affected_paths`, `why_risky` | unit | `pnpm --filter @cockpit/daemon test run` | Wave 0 |
| APPR-05 | Auto-deny fires after `COCKPIT_APPROVAL_TIMEOUT_MS` ms with `decision: "timeout"` in `approvals` table | integration | `pnpm --filter @cockpit/daemon test run` | Wave 0 |
| APPR-05 | `approval_resolved` event with `decision: "timeout"` is broadcast via WebSocket | integration | `pnpm --filter @cockpit/daemon test run` | Wave 0 |
| APPR-06 | All decisions (approve/deny/always_allow/timeout) are readable from `approvals` table | unit | `pnpm --filter @cockpit/daemon test run` | Wave 0 |
| NOTIF-01 | (manual) In-app notification appears when `approval_request` event arrives | manual | visual check in browser | — |
| NOTIF-02 | (manual) OS notification fires when tab is hidden and approval arrives | manual | hide tab, trigger hook, verify OS notification | — |

### Sampling Rate

- **Per task commit:** `pnpm --filter @cockpit/daemon test run`
- **Per wave merge:** `pnpm test run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/daemon/src/adapters/claude/__tests__/hookParser.test.ts` — covers DAEMON-04 mapping
- [ ] `packages/daemon/src/adapters/claude/__tests__/riskClassifier.test.ts` — covers APPR-02
- [ ] `packages/daemon/src/adapters/claude/__tests__/hookServer.test.ts` — covers APPR-01, APPR-03, APPR-05
- [ ] `packages/daemon/src/approvals/__tests__/approvalStore.test.ts` — covers APPR-04, APPR-06
- [ ] `packages/daemon/src/db/database.ts` — add `approvals` + `always_allow_rules` schema migration

---

## Sources

### Primary (HIGH confidence)

- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) — complete hook event types, HTTP hook input/output formats, `permissionDecision` response envelope, settings.json structure, timeout behavior
- [MDN Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API) — `requestPermission()`, `new Notification()`, `document.visibilityState` pattern
- Phase 1 implemented code — `@cockpit/shared` NormalizedEvent schema, `eventBus`, `persistEvent`, `broadcast`, `getEventsSince` — verified by reading source files directly

### Secondary (MEDIUM confidence)

- [Claude Code Hooks Multi-Agent Observability repo](https://github.com/disler/claude-code-hooks-multi-agent-observability) — reference implementation confirming the HTTP POST pattern for hook ingestion
- WebSearch results cross-referencing `hookSpecificOutput.permissionDecision` nested format for PreToolUse (confirmed against official docs)

### Tertiary (LOW confidence)

- Risk classification heuristics (bash patterns for `critical`/`high`) — derived from common security knowledge, not from an authoritative spec. Treat as starting point, not final policy.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Phase 2 extends Phase 1 stack; no new npm packages required; Node.js built-ins confirmed
- Architecture patterns: HIGH — hook input/output formats verified against official Claude Code docs; response envelope verified
- Approval round-trip: HIGH — Node.js HTTP `ServerResponse` hold pattern is well-established; timeout with `setTimeout` is standard
- Browser notifications: HIGH — MDN documentation is authoritative; localhost exception confirmed
- Risk classification heuristics: LOW — heuristics are project-specific judgment calls, not spec-derived

**Research date:** 2026-04-05
**Valid until:** 2026-06-05 (60 days — Claude Code hooks API is relatively stable but Anthropic ships frequently)
