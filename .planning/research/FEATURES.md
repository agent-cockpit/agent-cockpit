# Feature Research

**Domain:** Local browser-based coding agent control room (multi-provider: Claude Code + Codex)
**Researched:** 2026-04-04
**Confidence:** HIGH (competitor landscape direct; UX patterns from primary sources; Claude Code hooks from official docs)

---

## Competitive Landscape Summary

Before the feature tables, a brief map of the existing ecosystem this product competes with or exceeds:

| Tool | Type | What It Does Well | What It Lacks |
|------|------|------------------|---------------|
| **Pixel Agents** (pablodelucca) | VS Code extension | Animated agent visualization, sub-agent spawning, speech bubbles for wait states | VS Code-only, Claude-only, heuristic status detection (fires, misses), no approvals/memory/diff |
| **agents-observe** (simple10) | Local web dashboard | Hook-based event streaming, session history, agent hierarchy tree, search | Claude-only (Codex on roadmap), no approvals, no memory, read-only |
| **agentsview** (wesm) | Local web app | Multi-provider (12 agents), full-text search, analytics, keyboard-first | No real-time approvals, no memory management, analysis/history only |
| **agent-flow** (patoles) | Local web app | Interactive node graph of agent orchestration, branching visualization | No approvals, no memory, no diff review, Claude-only |
| **Claude-Code-Agent-Monitor** | Local web dashboard | Kanban status board, tool usage tracking, WebSocket live updates | No approvals, no diff, no memory, Claude-only |
| **oh-my-claudecode** | Orchestration layer | Multi-agent modes, cost/token HUD, Slack/Discord webhooks | Not a control room; orchestration layer only, complex setup |
| **VS Code Agent Debug Panel** (1.110) | IDE panel | Chat events, tool calls, system prompts in real-time | IDE-bound, no approvals, no memory editing, no Codex |

**Gap Agent Mission Control fills:** No existing tool combines approvals + memory + diff review + multi-provider (Claude + Codex) + browser-first. The space is highly fragmented.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any agent monitoring tool. Missing these makes the product feel broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Live session list with status indicators** | Every dashboard tool (agentsview, agents-observe, agent-view) shows this; users arrive expecting it | LOW | Active/idle/waiting/failed color-coded states; must update in real time via WebSocket |
| **Real-time event stream per session** | agents-observe, agent-flow all do this; developers need to see what the agent is doing right now | MEDIUM | Stream from daemon via WebSocket; deduplicate tool pre/post pairs client-side |
| **Session persistence across browser refresh** | Users run long sessions; data loss on refresh is a show-stopper | MEDIUM | SQLite in daemon; UI rehydrates on connect |
| **Sub-agent hierarchy visualization** | Pixel Agents and agents-observe show parent/child links; users expect this once they see it | MEDIUM | Tree or indented list; requires tracking SubagentStart/SubagentStop hook events |
| **File diff view per session** | GitHub, code review tools establish this expectation; users want to know what changed | MEDIUM | Monaco diff component; file tree sidebar; scoped to one session |
| **Filter and search sessions** | Every multi-session tool has this; 10+ sessions becomes unusable without it | LOW | Filter by provider, status, project, recency; full-text search is a bonus |
| **Desktop/browser notifications for agent attention needed** | Users leave the dashboard and return; they need a push signal when approval or failure occurs | LOW | Web Notifications API; no native app required |
| **Session lifecycle display (start, progress, complete, fail)** | Users track task completion; seeing nothing is ambiguous | LOW | Elapsed time, completion status, final tool count shown in card |
| **Keyboard navigation** | agentsview uses vim-bindings; developer tools audiences expect keyboard shortcuts | LOW | At minimum: session switch, approve/deny without mouse |
| **Approval prompt display** | Claude Code and Codex both have approval gates; users expect to handle these somewhere | HIGH | This is a core differentiator, but absence would make the tool feel read-only and incomplete |
| **Local-first privacy** | Developers will not use a cloud-first tool for agent sessions involving proprietary code | LOW | Daemon binds to localhost; no telemetry; all data in local SQLite |

### Differentiators (Competitive Advantage)

Features that set Agent Mission Control apart. No competitor has all of these together.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Unified approval inbox (multi-provider)** | No existing tool aggregates approvals across Claude Code AND Codex in one queue. This is the core safety surface users need. | HIGH | Requires Claude hooks (PermissionRequest) + Codex app-server approval events; risk classification per type (shell, file, network, MCP tool, user input) |
| **Risk classification on approvals** | Users develop automation complacency when approving blindly; labeling shell vs file vs network with a risk hint slows down dangerous approvals | MEDIUM | Rule-based classification (shell commands = HIGH by default; file reads = LOW); show "why risky" one-liner |
| **Approve-once / always-allow / deny-once decision modes** | Granular trust vocabulary matching the Autonomy Dial UX pattern from Smashing Magazine; Cursor and Codex CLI only offer binary approve/deny | MEDIUM | Store decisions in SQLite; apply "always-allow" within session or project scope |
| **Replayable timeline with scrubbing** | AgentOps markets "time-travel debugging" as a key value prop; no local Claude/Codex tool has it yet | HIGH | Event log stored per session; UI shows scrubable timeline; jump-to-approval, jump-to-file-change filters |
| **Memory panel (read + edit + approve)** | No competitor surfaces CLAUDE.md / auto memory in a UI. Developers currently edit flat files by hand. | HIGH | Parse CLAUDE.md + auto memory per project; surfaced as an editable list; approve agent-suggested memory notes before they write |
| **Provider-normalized memory view** | Claude and Codex have different memory systems (CLAUDE.md vs AGENTS.md); a unified surface is unique | HIGH | Schema normalization; abstract provider-specific memory files into common note format |
| **Office mode (pixel-art spatial view)** | Pixel Agents proved this concept is compelling (41K installs, Fast Company coverage); browser-first with no VS Code dependency expands audience significantly | HIGH | Canvas/Pixi renderer; hook-driven animations; this is the demo-able, shareable, "creator" hook |
| **Session comparison view** | No existing tool offers side-by-side session comparison (two runs of same task, different providers) | MEDIUM | Read-only; compare provider, runtime, approvals triggered, files touched, final status |
| **Provider-agnostic (Claude + Codex from day 1)** | All existing observability tools are Claude-only (Codex is on roadmaps, not shipped); supporting both doubles TAM and blocks future lock-in | HIGH | Two adapters in daemon: Claude hooks adapter + Codex JSONL/app-server adapter |
| **Explainable approval rationale ("why risky")** | Smashing Magazine pattern: "Because you said X, I did Y." Users form better mental models when approvals include context | LOW | Template-based rationale generation per approval type; no LLM required in v1 |
| **Confidence signal on agent status** | Show uncertainty: idle-timer heuristics (like Pixel Agents) misfire badly; hook-based ground truth lets us show real states | LOW | Hook events provide ground truth; distinguish "actively working", "waiting for input", "completed", "failed" without polling |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem valuable but create complexity, safety risk, or drift without payoff in v1.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Approval macro / policy rules engine** | Power users want "always allow npm install" rules | Rules that fire incorrectly in new contexts are dangerous; building a policy engine is a large standalone project; users overestimate how consistent their own rules are | Provide session-scoped "always allow" as a stepping stone; defer cross-session rules to v2 |
| **Real-time everything (streaming every keypress)** | Looks impressive in demos | Creates backpressure in WebSocket pipe; at 10 concurrent sessions, keystroke streaming is noisy and burns CPU; hides signal in noise | Stream tool-level events (PreToolUse/PostToolUse); aggregate below tool level |
| **LAN / remote multi-user access** | Developers want to share with teammates | Introduces auth, TLS, session ownership, and secrets exposure complexity; local-first privacy guarantee breaks | Ship local-only; document reverse-proxy pattern for advanced users (like agentsview does with Caddy); defer to v2 |
| **Full agent runtime / orchestration layer** | Users ask "can it launch agents for me?" | Replacing Claude Code / Codex as a runtime is a completely different product; creates version compatibility debt; confuses the value prop | Provide "attach to existing session" and "launch via provider CLI"; be the control plane, not the runtime |
| **Cloud sync / backup** | Users want history on multiple machines | Cloud sync requires a backend, auth, and privacy decisions; contradicts local-first promise | Ship SQLite export; document manual sync; defer cloud to post-MVP |
| **Themes / skins marketplace** | Creator/OSS audience wants customization | UI polish competes with core feature completion time; marketplace is an ongoing maintenance surface | Ship one clean default theme; make Office mode assets swappable via config; block theme ecosystem until core is stable |
| **Chat with agent from dashboard** | agentsview and Pixel Agents show this as a feature | Implementing bidirectional agent messaging requires deep protocol integration with both Claude Code and Codex; message injection is not stable in v1 APIs | Show transcript (read-only); let user switch to terminal for input; defer bidirectional chat |
| **Cost / token tracking** | oh-my-claudecode's HUD and AgentOps feature this prominently | Token counts require API-level access or model-level inference; hook events from Claude Code do not currently expose reliable token counts | Display event count and session duration as proxies; do not attempt token billing estimates until data is reliable |
| **Automatic session fan-out ("Battle mode")** | Running same task on multiple providers simultaneously is compelling | Requires coordinating prompt delivery, result collection, and merge logic — a separate orchestration feature | Flag as post-MVP in PROJECT.md; build solid single-session first |

---

## Feature Dependencies

```
[Local Daemon (WebSocket + SQLite)]
    └──required-by──> [Live Session List]
    └──required-by──> [Real-time Event Stream]
    └──required-by──> [Session Persistence]
    └──required-by──> [Approval Inbox]
    └──required-by──> [Timeline/Replay]
    └──required-by──> [Diff & Artifact Review]
    └──required-by──> [Memory Panel]

[Claude Hooks Adapter]
    └──required-by──> [Approval Inbox (Claude)]
    └──required-by──> [Sub-agent Hierarchy]
    └──required-by──> [Real-time Event Stream (Claude)]
    └──required-by──> [Memory Panel (Claude read)]

[Codex JSONL/App-Server Adapter]
    └──required-by──> [Approval Inbox (Codex)]
    └──required-by──> [Real-time Event Stream (Codex)]

[Session Persistence]
    └──required-by──> [Timeline/Replay]
    └──required-by──> [Search & History]
    └──required-by──> [Session Comparison]
    └──required-by──> [Approval History]

[Approval Inbox]
    └──enhances──> [Risk Classification]
    └──requires──> [Approve-once / always-allow / deny-once decisions]

[Live Session List]
    └──enhances──> [Office Mode]
    └──required-by──> [Session Comparison]

[File Diff View]
    └──requires──> [Session Persistence]
    └──enhances──> [Timeline/Replay] (jump-to-file-change)

[Memory Panel]
    └──requires──> [Claude Hooks Adapter] (memory events)
    └──enhances──> [Approval Inbox] (approve agent-suggested memory updates)

[Desktop Notifications]
    └──requires──> [Local Daemon] (push signals)
    └──enhances──> [Approval Inbox] (alert user to pending approval)
```

### Dependency Notes

- **Daemon is the critical path:** All UI features depend on the local daemon. Daemon must be the first phase.
- **Approval Inbox requires both adapters:** A partial approval inbox (Claude-only) ships earlier; Codex approval support arrives with the Codex adapter.
- **Timeline/Replay requires persistent event storage:** Events must be written to SQLite with session/timestamp indexing from session start, not retrofitted later.
- **Memory Panel requires Memory events in the Claude adapter:** Memory reads and suggested-memory hook events must be captured from session start; cannot be added after the fact without re-running sessions.
- **Office Mode enhances, does not require:** It reads from the same session data as the session list; it is an additive view, not a blocker.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the two core value props: unified approval control + multi-session visibility.

- [ ] **Local daemon with WebSocket + SQLite** — nothing else works without it
- [ ] **Claude Code adapter (hooks-based)** — live event stream, session discovery, approval signals, memory events, subagent tracking
- [ ] **Codex adapter (JSONL + app-server)** — event stream, approval signals, session resume
- [ ] **Live session list with status indicators** — primary navigation surface
- [ ] **Approval Inbox (unified, multi-provider)** — the core value prop; approve-once / deny-once / always-allow-in-session
- [ ] **Risk classification on approvals** — distinguishes shell/file/network/MCP by type; shows "why" hint
- [ ] **Real-time event stream per session** — what is the agent doing right now
- [ ] **File diff view per session** — what did the agent change
- [ ] **Session persistence across browser refresh** — data survives restarts
- [ ] **Desktop/browser notifications (approval needed, session failed, session complete)** — users step away
- [ ] **Office Mode (basic)** — animated agents, state-driven by hooks; differentiator and demo hook
- [ ] **Memory Panel (read + edit)** — view and edit CLAUDE.md / project memory; approve agent-suggested notes

### Add After Validation (v1.x)

Features to add once core approval + monitoring loop is proven useful.

- [ ] **Timeline/Replay with scrubbing** — add once event storage is battle-tested; requires full event schema to be stable
- [ ] **Session Comparison (side-by-side)** — add when users report wanting to compare provider outputs
- [ ] **Search across sessions** — add when session history accumulates enough to be useful (>20 sessions)
- [ ] **Sub-agent hierarchy view** — improve once multi-agent Claude Code usage grows (currently early adopter territory)
- [ ] **Keyboard navigation (full)** — improve progressively; basic shortcuts from day one

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Approval macro / policy rules engine** — needs session-scoped "always allow" to be validated first
- [ ] **LAN / remote multi-user access** — introduces auth complexity; validate solo-dev value first
- [ ] **Session fan-out / Battle mode** — orchestration feature; separate product surface
- [ ] **Cost / token tracking** — API data reliability needs to improve
- [ ] **Cloud sync / backup** — local-first must be validated before adding cloud complexity
- [ ] **Themes / skins marketplace** — cosmetic; non-blocking

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Local daemon (WebSocket + SQLite) | HIGH | HIGH | P1 |
| Claude Code adapter (hooks) | HIGH | HIGH | P1 |
| Codex adapter (JSONL + app-server) | HIGH | HIGH | P1 |
| Live session list | HIGH | LOW | P1 |
| Approval Inbox (unified) | HIGH | HIGH | P1 |
| Risk classification on approvals | HIGH | MEDIUM | P1 |
| Approve-once / always-allow / deny-once | HIGH | MEDIUM | P1 |
| Real-time event stream per session | HIGH | MEDIUM | P1 |
| File diff view | HIGH | MEDIUM | P1 |
| Session persistence | HIGH | MEDIUM | P1 |
| Desktop notifications | HIGH | LOW | P1 |
| Office Mode (basic) | MEDIUM | HIGH | P1 (demo/share value) |
| Memory Panel (read + edit) | HIGH | HIGH | P1 |
| Timeline/Replay | HIGH | HIGH | P2 |
| Search across sessions | MEDIUM | MEDIUM | P2 |
| Session comparison | MEDIUM | MEDIUM | P2 |
| Sub-agent hierarchy view | MEDIUM | MEDIUM | P2 |
| Keyboard navigation (full) | MEDIUM | LOW | P2 |
| Approval macro / policy rules | MEDIUM | HIGH | P3 |
| LAN / remote access | LOW | HIGH | P3 |
| Cost / token tracking | LOW | HIGH | P3 |
| Cloud sync | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | Pixel Agents | agents-observe | agentsview | Agent Mission Control |
|---------|--------------|----------------|------------|-----------------------|
| Live agent visualization | Yes (pixel art) | No | No | Yes (Office Mode) |
| Real-time event stream | Heuristic | Yes (hook-based) | Yes (SSE) | Yes (hook-based, WebSocket) |
| Sub-agent hierarchy | Yes | Yes | No | Yes |
| Approval handling | No | No | No | **Yes (core feature)** |
| Risk classification | No | No | No | **Yes** |
| Multi-provider (Codex) | No | No (planned) | Yes (12 providers) | **Yes (Claude + Codex)** |
| Memory panel | No | No | No | **Yes** |
| Timeline / Replay | No | Partial (event browse) | No | Yes (v1.x) |
| File diff view | No | No | No | **Yes** |
| Session comparison | No | No | No | Yes (v1.x) |
| Full-text search | No | Yes | Yes | Yes (v1.x) |
| Desktop notifications | Partial (sound) | No | No | **Yes** |
| Local-first / no cloud | Yes | Yes | Yes | Yes |
| Browser-first (not IDE) | No | Yes | Yes | **Yes** |
| Provider-normalized memory | No | No | No | **Yes** |

---

## UX Pattern Reference

Key UX patterns from research that should inform implementation decisions:

**Approval UX:**
- Autonomy Dial — let users set risk tolerance per task type; not all approvals need the same friction (Smashing Magazine, 2026)
- Explainable rationale — "this shell command modifies /etc/hosts, which is system-level" beats "shell command detected" (Smashing Magazine)
- Automation complacency is a real failure mode — visual risk differentiation (color, icon, label) slows dangerous approvals
- Intent Preview pattern — show what the agent WILL DO before it acts, with Proceed/Deny/Edit options

**Session Monitoring UX:**
- Ground-truth state from hooks beats heuristic polling — Pixel Agents' heuristic idle-timer approach visibly misfires; hooks give exact state
- Real-time = tool-level granularity — streaming below tool level (keystrokes, partial outputs) creates noise, not signal
- Sub-agent visualization: parent/child linking is expected once users run multi-agent Claude Code

**Diff Review UX:**
- File tree sidebar + diff panel is the established pattern (GitHub, Reviewable.io)
- Session-scoped diffs (not commit-scoped) are the natural unit for agent output review
- AI-generated walkthrough summaries (what changed and why) reduce cognitive load before diff inspection — applicable to agent session summary

**Memory Management UX:**
- CLAUDE.md has a well-documented "under 300 lines" discipline; surface line count and last-modified in the UI
- Agent-suggested memory should be in an "approve before write" queue, not auto-applied — users want to audit what the agent learned
- Distinguish instruction memory (user-written rules) from auto memory (agent-learned patterns) — different editing semantics

**Notification UX:**
- Browser Notification API is sufficient; no native app needed for v1
- Notify on: approval needed, session failed, session completed, subagent returned, provider disconnected
- Do not notify on every tool call — this creates alert fatigue immediately

---

## Sources

- [Pixel Agents — Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=pablodelucca.pixel-agents) — direct feature inspection, limitation analysis
- [agents-observe (simple10/GitHub)](https://github.com/simple10/agents-observe) — architecture and feature analysis
- [agentsview (wesm/GitHub)](https://github.com/wesm/agentsview) — multi-provider feature set
- [Designing For Agentic AI: Practical UX Patterns — Smashing Magazine (2026)](https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/) — Autonomy Dial, Intent Preview, Escalation Pathway patterns
- [Claude Code Hooks Reference — official docs](https://code.claude.com/docs/en/hooks-guide) — lifecycle events, PermissionRequest hook, approval system
- [Best AI Observability Tools 2026 — Arize](https://arize.com/blog/best-ai-observability-tools-for-autonomous-agents-in-2026/) — time-travel debugging, session replay patterns
- [AI Agent Observability Comparison 2026 — Latitude](https://latitude.so/blog/ai-agent-observability-tools-developer-comparison-guide-2026-devto) — tool capabilities landscape
- [The Complete Guide to AI Agent Memory Files — Medium/HackerNoon](https://hackernoon.com/the-complete-guide-to-ai-agent-memory-files-claudemd-agentsmd-and-beyond) — CLAUDE.md, auto memory, AGENTS.md patterns
- [Human-in-the-Loop for Agentic Workflows — AlignX AI/Medium (2026)](https://medium.com/@AlignX_AI/designing-human-in-the-loop-for-agentic-workflows-079faec737ed) — oversight model patterns
- [oh-my-claudecode (Yeachan-Heo/GitHub)](https://github.com/yeachan-heo/oh-my-claudecode) — multi-agent orchestration HUD reference
- [Codex CLI vs Claude Code 2026 — Blake Crosley](https://blakecrosley.com/blog/codex-vs-claude-code-2026) — adapter surface comparison
- [Your Home for Multi-Agent Development — VS Code Blog (2026)](https://code.visualstudio.com/blogs/2026/02/05/multi-agent-development) — VS Code Agent Debug Panel feature set
- [Pixel Agents solves AI coding UX problems — Fast Company](https://www.fastcompany.com/91497413/this-charming-pixel-art-game-solves-one-of-ai-codings-most-annoying-ux-problems) — audience reception analysis
- [agent-flow (patoles/GitHub)](https://github.com/patoles/agent-flow) — node graph visualization reference
- [Claude-Code-Agent-Monitor (hoangsonww/GitHub)](https://github.com/hoangsonww/Claude-Code-Agent-Monitor) — Kanban status board reference

---

*Feature research for: Local browser-based coding agent control room (Agent Mission Control)*
*Researched: 2026-04-04*
