# Stack Research

**Domain:** Local daemon + browser-UI devtool with real-time WebSocket streaming, SQLite persistence, Canvas/WebGL visualization
**Researched:** 2026-04-04
**Confidence:** HIGH (all versions verified against npm registry; architecture rationale sourced from official docs and ecosystem consensus)

---

## Recommended Stack

### Daemon Layer (Node.js process)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22 LTS | Runtime for the local daemon | LTS with native TypeScript strip-types support (--experimental-strip-types available from v22, on by default from v23). Avoids need for a transpiler in production. |
| TypeScript | 6.0.x | Type safety across daemon and shared types | Required for shared event schema between daemon and frontend. v6 is current; strict mode is non-negotiable for a long-lived local service. |
| tsx | 4.21.x | TypeScript runner for dev + watch mode | Replaces ts-node + nodemon entirely. Works with ESM, zero config, `tsx --watch` for daemon hot-reload. ts-node is broken with Node ESM. |
| ws | 8.20.x | WebSocket server | Raw, minimal, zero-dependency WebSocket server. 50K+ connections per process. No socket.io abstraction needed — this is a local-only app with one browser client; fallback transports and rooms are irrelevant overhead. |
| better-sqlite3 | 12.8.x | SQLite driver | Synchronous API (correct for a single-writer daemon), fastest pure-Node SQLite driver, WAL mode support, prepared statements. No async complexity for a local app that never needs connection pooling. |
| drizzle-orm | 0.45.x | ORM / query builder over better-sqlite3 | Type-safe schema-as-code, auto-generates migrations via drizzle-kit, SQL-like query syntax means no "magic" abstractions. Best pairing with better-sqlite3 in the Node ecosystem as of 2025-2026. |
| drizzle-kit | 0.31.x | Migration CLI for drizzle-orm | Companion to drizzle-orm; generates timestamped migration files, supports push/pull/migrate commands. |
| chokidar | 5.0.x | Filesystem watcher | Standard cross-platform file watcher; used in VS Code, webpack, Vite. v5 is ESM-only (published Nov 2025), requires Node >= 20. Watch CLAUDE.md, memory files, JSONL output directories. |
| zod | 4.3.x | Runtime schema validation | Validates incoming hook payloads and JSONL events from providers at the daemon boundary. 14x faster than v3, 57% smaller. Define event schemas once; share inferred types with the frontend. |

### Frontend Layer (Vite + React)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vite | 8.0.x | Build tool and dev server | The standard for React/TypeScript frontends as of 2025. Native ESM, instant HMR, no bundling in dev. Create React App is dead. |
| React | 19.x | UI framework | Current major version; required by @pixi/react v8 and shadcn/ui updates. useSyncExternalStore (used by Zustand v5) is native. |
| TypeScript | 6.0.x | Type safety | Same version as daemon; shared type package (e.g. `packages/shared`) carries event schema types generated from Zod schemas. |
| Zustand | 5.0.x | Client state management | Best choice for WebSocket-driven state. Stores are updatable from outside React (in WebSocket message handlers) without workarounds — this is the critical advantage over Jotai for a streaming data scenario. Minimal boilerplate, no provider wrapping. |
| Tailwind CSS | 4.2.x | Utility CSS | v4 is CSS-first config (no tailwind.config.js). Current version compatible with shadcn/ui. Correct for a dense devtool UI. |
| shadcn/ui | latest | Component library | Unstyled, copy-paste components on top of Radix UI primitives. Not an npm package — components live in your repo. Compatible with Tailwind v4 as of February 2025. Correct for a devtool where you own every pixel of the Ops mode panels. |
| pixi.js | 8.17.x | 2D WebGL/WebGPU renderer for Office mode | The standard 2D web renderer. v8 supports both WebGL2 and WebGPU backends. `roundPixels` option enables pixel-perfect rendering for pixel-art sprites. Handles 10+ animated agents at 60fps without batching concerns. |
| @pixi/react | 8.0.x | React bindings for PixiJS | Official React integration for PixiJS v8. Released March 2025. JSX pragma approach, `extend` API for tree-shaking, designed for React 19. Lets you write Office mode as React components rather than imperative PixiJS scene graph calls. |
| react-diff-view | 3.3.x | Git diff/patch renderer | Dedicated git unified diff viewer. Accepts parsed diff hunks, renders split or unified views with syntax highlight hooks. More appropriate than Monaco DiffEditor for read-only file-change review in the Diff & Artifact panel (lighter, purpose-built). |
| @monaco-editor/react | 4.7.x | Code editor for Memory panel | Official Monaco wrapper for React. No webpack config needed; Vite-compatible. Use for the editable Memory panel (CLAUDE.md, memory notes). Has built-in DiffEditor component — use it only when interactive editing of diffs is needed (memory approval flow), not for read-only diff display. |
| react-router-dom | 7.14.x | Client-side routing | Handles Office mode / Ops mode switching and deep-links to session detail views. v7 is current. |

### Development & Tooling

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| tsx | 4.21.x | Daemon dev runner | `tsx --watch src/daemon/index.ts` replaces nodemon + ts-node entirely |
| drizzle-kit | 0.31.x | Migration CLI | `drizzle-kit generate` + `drizzle-kit migrate` for schema evolution |
| Vite | 8.0.x | Frontend dev server | `vite dev` with proxy config to forward `/ws` to the daemon's WebSocket port |
| ESLint + typescript-eslint | latest | Linting | Required for shared-type safety across monorepo packages |

---

## Installation

```bash
# Daemon dependencies
npm install ws better-sqlite3 drizzle-orm chokidar zod

# Daemon dev dependencies
npm install -D tsx typescript @types/node @types/better-sqlite3 drizzle-kit

# Frontend dependencies
npm install react react-dom react-router-dom zustand pixi.js @pixi/react react-diff-view @monaco-editor/react

# Frontend dev dependencies
npm install -D vite @vitejs/plugin-react tailwindcss typescript
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| WebSocket server | `ws` | Socket.IO | Socket.IO's fallback transports, rooms, and namespaces are irrelevant for a local single-client app. The overhead (multiple npm packages, protocol overhead) is not justified. `ws` gives direct control over the wire protocol — important for implementing a structured event envelope. |
| WebSocket server | `ws` | native `http` + `ws` upgrade | Same thing — `ws` wraps this pattern cleanly. |
| SQLite driver | `better-sqlite3` | `bun:sqlite` | Project uses Node.js, not Bun. Bun SQLite is 3-6x faster but requires adopting the Bun runtime everywhere, which changes the deployment story for a tool distributed to developers. |
| SQLite ORM | `drizzle-orm` | `Prisma` | Prisma requires a separate query engine binary and async-only API. For a local daemon doing synchronous SQLite writes (which is correct for WAL-mode SQLite), better-sqlite3 + drizzle is the right pairing. Prisma is over-engineered for this use case. |
| SQLite ORM | `drizzle-orm` | raw `better-sqlite3` SQL | Feasible but loses schema-as-code, migration generation, and type-safe queries. Drizzle adds negligible overhead. |
| Canvas/WebGL | `pixi.js` + `@pixi/react` | Raw HTML Canvas 2D API | Raw Canvas is fine for simple cases but requires manual sprite batching, texture management, and animation loop wiring. PixiJS handles all of this and adds WebGPU fallback path. 10 animated agents with per-frame updates warrants the abstraction. |
| Canvas/WebGL | `pixi.js` | Phaser | Phaser is a game engine (physics, scenes, input system) — far too heavy. Office mode is a visualization layer, not a game. |
| Canvas/WebGL | `pixi.js` | Three.js | Three.js is 3D-first. Office mode is 2D pixel art. PixiJS is the correct tool. |
| State management | Zustand | Jotai | Jotai's atomic model is excellent for complex derived state but requires workarounds to update atoms from WebSocket handlers outside React. Zustand stores are vanilla JS objects that can be written to from any callback. For a streaming event feed, this matters. |
| State management | Zustand | Redux Toolkit | Redux is heavyweight for a dashboard of this scope. Zustand is idiomatic for 2025 React. |
| State management | Zustand | TanStack Query | TanStack Query is a server-state cache, not a real-time event store. It can subscribe to WebSocket invalidation signals but doesn't model a time-ordered event stream natively. Use it if REST endpoints are added later; not as the primary state layer. |
| Diff viewer | `react-diff-view` | `@monaco-editor/react` DiffEditor | Monaco DiffEditor is interactive (allows editing) and heavy (loads full Monaco). For read-only session file-change review, `react-diff-view` is 95% lighter and purpose-built. Use Monaco only where editing is needed (Memory panel). |
| TypeScript runner | `tsx` | `ts-node` | ts-node does not support Node.js ESM without complex flag configuration. tsx handles all module formats with zero config and includes watch mode. ts-node is effectively deprecated for new projects on Node 20+. |
| CSS framework | Tailwind v4 + shadcn/ui | CSS Modules | Tailwind is faster to iterate on for dense devtool layouts. shadcn/ui provides production-quality Radix-based components (dialogs, popovers, dropdowns, tabs) that are required for Ops mode panels. CSS Modules require writing everything from scratch. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Socket.IO | Adds protocol overhead and unnecessary features (rooms, namespaces, fallback transports) for a local single-client daemon. Breaks raw WebSocket connections from browser DevTools. | `ws` npm package |
| Prisma | Requires async API, external query engine binary, and is optimized for PostgreSQL/cloud databases. Mismatch with synchronous better-sqlite3 daemon design. | drizzle-orm + better-sqlite3 |
| ts-node | Broken ESM support on Node 20+. Requires complex flag setup. Effectively unmaintained for ESM use cases. | `tsx` |
| Create React App | Dead project. No longer maintained. | Vite |
| Phaser | A full game engine (physics, input, scenes). Office mode is a 2D visualization canvas, not a game. Brings 1MB+ overhead with features you'll never use. | pixi.js |
| Redux / Redux Toolkit | Heavyweight for a local devtool. Boilerplate cost is high relative to benefit for an app that doesn't need time-travel debugging or complex middleware chains. | Zustand |
| React Context for real-time state | Context triggers full subtree re-renders on every update. A WebSocket event stream updating at 10-100 events/second with Context will cause visible jank. | Zustand (selective subscriptions) |
| `sqlite3` (async driver) | The async `sqlite3` package is slower and adds callback/Promise complexity with no benefit for a single-process local daemon. | better-sqlite3 |
| Zod v3 | v4 is 14x faster and 57% smaller. No migration blocker. | zod v4 |

---

## Stack Patterns by Variant

**Daemon event envelope (WebSocket message format):**
- Define a discriminated union type in a shared package using Zod schemas
- Daemon sends `{ type: "session.started", payload: {...}, ts: number }`
- Frontend Zustand store dispatches on `type` — mirrors Redux action pattern but without Redux
- Zod parse on daemon side (inbound hooks/JSONL); TypeScript type assertions on frontend side (trusted local source)

**Office mode rendering loop:**
- Use `@pixi/react` for the React component tree that mounts agents
- Each agent is a `<pixiContainer>` with `<pixiAnimatedSprite>` children
- Use a Zustand selector per session ID to feed agent state into the sprite
- Set `roundPixels: true` on the Application for pixel-perfect art

**SQLite WAL mode (required for concurrent reads):**
- Enable WAL on DB open: `db.pragma('journal_mode = WAL')`
- Daemon writes are synchronous; browser (via WebSocket) is read-only
- drizzle migrations run at daemon startup before WebSocket server binds

**Diff panel rendering:**
- Parse git unified diff text with `parse` from `react-diff-view/utils`
- Pass hunks to `<Diff>` component with `viewType="split"`
- For inline diff highlighting, use the token system from `react-diff-view`

**Memory panel editing:**
- Mount `<MonacoEditor>` or `<DiffEditor>` from `@monaco-editor/react`
- Use `language="markdown"` for CLAUDE.md editing
- On save, daemon receives the new content via WebSocket message and writes to disk

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@pixi/react@8.0.x` | `pixi.js@^8.2.6`, `react@19.x` | Requires React 19. Do not use with React 18. |
| `zustand@5.0.x` | `react@18+` | Drops React < 18. Uses native useSyncExternalStore. |
| `drizzle-orm@0.45.x` | `better-sqlite3@12.x`, `drizzle-kit@0.31.x` | Keep drizzle-orm and drizzle-kit in sync — they share protocol. |
| `chokidar@5.x` | `node@>=20` | ESM-only. Requires Node 20 minimum. Breaks on older Node. |
| `@monaco-editor/react@4.7.x` | `react@19.x` (rc) | v4.7.0-rc.0 for React 19. Stable v4.6.x works with React 18. Use rc for React 19 projects. |
| `zod@4.x` | `typescript@>=5.5` | Requires TypeScript 5.5+. TypeScript 6 is compatible. |
| `tailwindcss@4.x` | `shadcn/ui` Feb 2025+ | shadcn/ui supports Tailwind v4 from the February 2025 CLI update. Older shadcn component installs need re-init. |

---

## Sources

- npm registry (verified 2026-04-04): ws@8.20.0, better-sqlite3@12.8.0, drizzle-orm@0.45.2, pixi.js@8.17.1, zustand@5.0.12, @pixi/react@8.0.5, react-diff-view@3.3.3, @monaco-editor/react@4.7.0, chokidar@5.0.0, vite@8.0.3, react@19.2.4, drizzle-kit@0.31.10, zod@4.3.6, tailwindcss@4.2.2, tsx@4.21.0, typescript@6.0.2
- [PixiJS v8 Launch Blog](https://pixijs.com/blog/pixi-v8-launches) — WebGL/WebGPU renderer capabilities, roundPixels, performance
- [Introducing PixiJS React v8](https://pixijs.com/blog/pixi-react-v8-live) — React 19 requirement, JSX pragma, extend API
- [Drizzle ORM SQLite docs](https://orm.drizzle.team/docs/get-started-sqlite) — better-sqlite3 driver pairing, migration workflow
- [tsx official site](https://tsx.is/) — ESM support, watch mode, comparison with ts-node
- [Zustand v5 announcement](https://pmnd.rs/blog/announcing-zustand-v5) — React 18+ requirement, useSyncExternalStore
- [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) — compatibility confirmation, CSS-first config
- [ws npm package](https://www.npmjs.com/package/ws) — version, performance, local daemon use case
- [react-diff-view npm](https://www.npmjs.com/package/react-diff-view) — version 3.3.3, git unified diff support
- [Zod v4 InfoQ coverage](https://www.infoq.com/news/2025/08/zod-v4-available/) — 14x performance improvement, TypeScript 5.5+ requirement
- [chokidar npm](https://www.npmjs.com/package/chokidar) — v5 ESM-only, Node 20+ requirement
- WebSearch findings (MEDIUM confidence): tsx vs ts-node comparison, Zustand external-update capability for WebSocket use cases, Jotai workaround requirement for out-of-React updates

---
*Stack research for: Agent Mission Control — local daemon + browser devtool*
*Researched: 2026-04-04*
