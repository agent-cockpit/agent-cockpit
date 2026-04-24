# Agent Cockpit — Design System

Source of truth: `packages/ui/src/index.css`. All tokens live in the `@theme` block (line 3) and the `:root` block (line 33). All utility classes live in the sections below them. If it's not in `index.css`, it's not part of the system yet.

Aesthetic: **retro mission-control meets 8-bit arcade**. Dark-only. Phosphor accents. Corner brackets. Press Start 2P for chrome, IBM Plex Mono for data, IBM Plex Sans for prose. Pixelated sprites (`image-rendering: pixelated`). No emoji, no gradients-for-gradients'-sake, no purple-on-white SaaS defaults.

---

## 1. Design tokens

All tokens are CSS custom properties. Consume them with `var(--token)` or `color-mix(in srgb, var(--token) N%, transparent)`. Tailwind utilities use bracket syntax: `bg-[var(--color-panel-surface)]`.

### 1.1 Color — semantic

| Token | Value (OKLch) | Use |
|---|---|---|
| `--color-background` | `oklch(0.2 0.02 255)` | App/page bg |
| `--color-foreground` | `oklch(0.96 0.01 255)` | Body text |
| `--color-sidebar` | `oklch(0.24 0.03 250)` | Nav / rail bg |
| `--color-panel-surface` | `oklch(0.185 0.025 250)` | Card/panel bg (one step darker than bg) |
| `--color-border` | `oklch(0.4 0.02 252)` | Default border |
| `--color-muted` | `oklch(0.31 0.02 252)` | Subtle fill |
| `--color-muted-foreground` | `oklch(0.8 0.02 250)` | Secondary text |
| `--color-accent` | `oklch(0.65 0.12 215)` | Primary accent (cyan) |
| `--color-menu-overlay` | `rgba(0,0,0,0.45)` | Dialog backdrops |

### 1.2 Color — phosphor palette

| Token | Use |
|---|---|
| `--color-cockpit-cyan` | Default chrome accent, info |
| `--color-cockpit-amber` | Selected / active / CTA |
| `--color-cockpit-green` | Success / allow |
| `--color-cockpit-red` | Danger / deny / errors |
| `--color-cockpit-dim` | Inactive, dimmed text |

### 1.3 Color — provider brand

| Token | Value |
|---|---|
| `--color-provider-claude` | `#c15f3c` |
| `--color-provider-codex` | `#605de6` |
| `--color-cockpit-blue-claude-bg` / `-text` | Claude badge |
| `--color-cockpit-purple-codex-bg` / `-text` | Codex badge |

### 1.4 Contextual accent — `--color-cockpit-accent`

This variable is the **dynamic accent** — components read it, and parents override it per context. Defaults to cyan. Provider views override to Claude-orange or Codex-purple via `getProviderAccentStyle()` at `packages/ui/src/components/providerAccent.ts`.

```tsx
<div style={getProviderAccentStyle('claude')}>
  {/* .cockpit-btn inside this subtree will render in Claude orange */}
</div>
```

### 1.5 Typography

Three families, each with a single purpose:

| Token | Stack | Use |
|---|---|---|
| `--font-sidebar-display` | Press Start 2P → VT323 → Courier New | Titles, button labels, UI chrome. Use at small sizes (0.5–0.7rem) — big Press Start 2P only for title cards (`.start-title`). |
| `--font-mono-data` | IBM Plex Mono → JetBrains Mono → Courier New | Metrics, readouts, timestamps, IDs, code |
| `--font-sidebar-body` | IBM Plex Sans → Inter → Segoe UI | Prose, descriptions, dialog body copy |

Never introduce a fourth family. Never use Inter as the display face — it's the fallback only.

### 1.6 Spacing / sizing

Tailwind defaults. No custom spacing scale. For cockpit chrome:

- `--bracket-size: 10px` — corner bracket arm length
- `--bracket-weight: 1.5px` — corner bracket stroke

Touch targets ≥ 32px. Dialog rails use `px-4 py-3`. Cards use `px-3 py-2` minimum.

### 1.7 Motion

Defined animations (use these before inventing):

| Keyframe | Purpose |
|---|---|
| `radar-pulse` | Status ping rings (1.8s infinite) |
| `terminal-caret-blink` | Blinking cursor (1s steps) |
| `start-cloud-drift` | Horizontal parallax loop |
| `start-title-flicker` | Page entrance title |
| `start-arrow-pulse` | Selected-menu ▶ indicator |
| `start-mascot-bob` | 4px vertical idle bob |
| `start-cog-spin` | Gear rotation on hover |
| `start-twinkle` | Stars |

Transition timing: `140ms` for hover/focus state changes, `150ms` for buttons. No `all` transitions — list properties explicitly (`background, border-color, box-shadow, color`).

---

## 2. Layout primitives

### 2.1 Corner-bracketed frame — `.cockpit-frame-full` + `.cockpit-corner-*`

The house style. Any boxed surface that deserves a frame gets four brackets. Mandatory for dialogs, cards, inline panels.

```tsx
<div className="cockpit-frame-full border border-border bg-[var(--color-panel-surface)] px-4 py-3">
  <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
  <span className="cockpit-corner cockpit-corner-tr" aria-hidden />
  <span className="cockpit-corner cockpit-corner-bl" aria-hidden />
  <span className="cockpit-corner cockpit-corner-br" aria-hidden />
  {children}
</div>
```

Always `aria-hidden` the brackets. Use two brackets (tl + br) for compact inline tags; four for dialogs, big cards, or focal panels.

### 2.2 Dialog pattern — Radix + cockpit chrome

Reference: `packages/ui/src/components/office/ClosetPopup.tsx` and `packages/ui/src/components/start/SettingsDialog.tsx`. Every dialog in the app follows the same shell:

```tsx
<Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
  <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 bg-black/45 z-40" />
    <Dialog.Content
      className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                 w-[92vw] max-w-md bg-background rounded-none
                 flex flex-col overflow-hidden border border-border/80
                 shadow-[0_0_40px_rgba(34,211,238,0.08),0_20px_60px_rgba(0,0,0,0.6)]"
    >
      <div className="cockpit-frame-full flex items-center gap-3 px-4 py-3 border-b border-border bg-[var(--color-panel-surface)]">
        <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
        <span className="cockpit-corner cockpit-corner-tr" aria-hidden />
        <span className="cockpit-corner cockpit-corner-bl" aria-hidden />
        <span className="cockpit-corner cockpit-corner-br" aria-hidden />
        <Dialog.Title className="cockpit-label">TITLE</Dialog.Title>
        <Dialog.Close className="ml-auto cockpit-label hover:text-foreground px-2 py-1">[X]</Dialog.Close>
      </div>
      <div className="p-4">{body}</div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

Rules:
- Always `rounded-none` (we don't round corners — brackets are our chrome).
- Header height: `px-4 py-3`. Title in `.cockpit-label`. Close button is literally `[X]`.
- Overlay at `z-40`, content at `z-50`.
- Cyan-tinted outer shadow on content (`rgba(34,211,238,...)`) ties the dialog to the phosphor aesthetic.

---

## 3. Components

### 3.1 Buttons

Three established variants. Pick the one that matches the context; don't mix.

**`.cockpit-btn`** — default. Cyan (or accent), transparent bg, border, uppercase Press Start 2P. Use for chrome actions, toolbar buttons, menu launchers.

```tsx
<button className="cockpit-btn">LAUNCH</button>
```

**Coloured decision buttons** — inline Tailwind with `color-mix`. Use for Allow/Deny/Edit on approvals, Confirm/Cancel on destructive dialogs. Reference: `packages/ui/src/components/panels/ApprovalInbox.tsx`.

```tsx
// Allow
className="cockpit-btn border-[color-mix(in_srgb,var(--color-cockpit-green)_58%,transparent)]
           bg-[color-mix(in_srgb,var(--color-cockpit-green)_18%,transparent)]
           text-[var(--color-cockpit-green)]"
// Deny → red  • Edit → cyan  • Confirm primary → amber
```

**`.office-overlay-btn`** — dark-blue filled pill for in-world overlay controls (Menu, Interact on the canvas). Only for overlay-on-game-canvas contexts.

**`.start-menu-item`** — big menu buttons for the title screen. Don't reuse elsewhere.

New button? Extend `.cockpit-btn`. Don't invent a fourth primary.

### 3.2 Cards / panels

Anatomy = `.cockpit-frame-full` + border + panel surface + corner brackets. Reference: `ApprovalInbox` and `AgentHoverCard`.

```tsx
<div className="cockpit-frame-full overflow-hidden border border-border bg-[var(--color-panel-surface)]">
  <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
  <span className="cockpit-corner cockpit-corner-br" aria-hidden />
  <div className="grid grid-cols-[68px_minmax(0,1fr)_154px]">
    {/* status rail | content | actions */}
  </div>
</div>
```

For risk/severity, colour the **left rail** not the whole card. Risk colours come from the phosphor palette.

### 3.3 Tab strip — `.cockpit-tab`

IBM Plex Mono, uppercase, 2px bottom border. Active state uses `.active` or `data-active="true"`. Colors animate via `color` + `border-color`.

```tsx
<button className={active ? 'cockpit-tab active' : 'cockpit-tab'}>TIMELINE</button>
```

### 3.4 Labels and readouts

| Class | Font / size | Use |
|---|---|---|
| `.cockpit-label` | Press Start 2P, 0.55rem, 0.12em letter-spacing, uppercase | Section labels: "FUEL LEVEL", "PILOT AVATAR" |
| `.data-readout` | IBM Plex Mono, 0.7rem, phosphor glow | Live metrics (count, elapsed time) |
| `.data-readout-dim` | IBM Plex Mono, 0.7rem, dim | Inactive/placeholder metrics |

Never put Press Start 2P at body size. Never use `.cockpit-label` for running text.

### 3.5 Status and feedback

**Ping dots** (radar pulse):

```tsx
<span className="status-ping status-ping-active" />   // green
<span className="status-ping status-ping-error" />    // red
<span className="status-ping status-ping-ended" />    // gray, no pulse
```

**Terminal caret** — `.chat-terminal-caret` — blinking 1Hz cursor. Drop it after readouts to indicate "live". See start-page footer.

**Sprite glow** — `.agent-sprite` + one of `.sprite-planning|coding|reading|testing|waiting|blocked|completed|failed`. Each sets `--glow-color` that feeds a `drop-shadow` filter.

### 3.6 Provider badges — `.badge-provider-claude` / `.badge-provider-codex`

Use for any surface that needs a provider chip. Don't hand-roll provider colours.

```tsx
<span className="badge-provider-claude px-2 py-0.5 text-xs font-mono">claude</span>
```

### 3.7 Risk badges — `<RiskBadge level="high" />`

Pixel-art PNGs from `public/sprites/badge-{level}.png`. Always prefer this over coloured text/dots for approval risk.

### 3.8 Loading — `<LoadingSpinner />`

Pixel-art GIF wrapper at `packages/ui/src/components/LoadingSpinner.tsx`. Use everywhere we'd otherwise drop a skeleton or a spinner.

### 3.9 Form inputs

Native `input`/`select`/`textarea` are restyled in `index.css` (lines ~214–230): dark background, foreground text, dim placeholder. Don't override `color` per-input unless you have a reason. Option elements are forced onto panel surface so dropdowns don't blind the user.

---

## 4. Patterns — when to use what

**Adding a new panel inside the office?** `cockpit-frame-full` + `.cockpit-corner-*` + `bg-[var(--color-panel-surface)]` + `border-border`. If it has a header, use `.cockpit-label` for the title.

**Adding a new dialog?** Copy `SettingsDialog.tsx` wholesale. Replace the body. Don't re-derive the shell — it's load-bearing for consistency.

**Adding a primary CTA in a new context?** `.cockpit-btn` with the amber accent (wrap in a parent that sets `--color-cockpit-accent: var(--color-cockpit-amber)` — that way the whole button recolours without per-button classes).

**Adding provider-aware UI?** Wrap in `style={getProviderAccentStyle(provider)}`. Every `.cockpit-btn`, `.cockpit-label`, `.data-readout`, `.cockpit-corner` inside automatically picks up the provider colour.

**Pixel asset (sprite, icon, badge)?** Always `image-rendering: pixelated` inline or via `.agent-sprite`. Never apply `border-radius` to pixel art.

**Adding an external link?** `window.open(url, '_blank', 'noopener,noreferrer')` — consistent with `StartPage.tsx`.

**Need an icon that isn't available?** Inline SVG with `fill="currentColor"` + `shape-rendering: crispEdges` + a `drop-shadow` glow (see `.start-settings-cog-icon`). No icon libraries — they don't match our pixel aesthetic.

---

## 5. Checklist for new UI

1. Does this colour exist as a token? If yes, reference the token. If no, add it to `@theme` in `index.css` before using it — not inline.
2. Is there an existing class? Grep `.cockpit-` and `.start-` before writing a new one.
3. Is the copy UPPERCASE where it should be? (`.cockpit-label`, `.cockpit-btn`, dialog titles, menu items — all uppercase.)
4. Are the corner brackets present on every frame? Four for dialogs/big panels, two (tl + br) for inline pills.
5. Is the transition an explicit property list (not `all`)?
6. Is the accent reading from `var(--color-cockpit-accent)`, so provider contexts can override?
7. Are you using Press Start 2P at body size? Don't. Cap it at 0.7rem outside of title cards.
8. Does it work on dark only? (We don't ship a light theme.)
9. Does `image-rendering: pixelated` apply to every pixel asset?
10. Can you delete the thing you just wrote and reuse an existing primitive instead?

---

## 6. Don'ts

- No `border-radius` on cockpit chrome. Square or don't ship.
- No gradients on body copy. Title cards only.
- No additional font families.
- No purple-on-white. No Tailwind `primary`/`secondary` default colours.
- No `all` transitions. No 300ms+ transitions on interaction (feels slow on a mission-control UI).
- No light-mode variants.
- No `rounded-lg`/`rounded-full` on buttons. Use `rounded-none` explicitly when working with third-party components (Radix) that default to rounded.
- No emoji in production UI. (Pixel sprites yes, Unicode emoji no.)
- Don't invent a new button variant. Extend `.cockpit-btn` via `--color-cockpit-accent`.
- Don't `className="cockpit-btn cockpit-btn-large"` — scale with padding/font-size directly; we don't have a size variant system.

---

## 7. Reference map

| Need | File |
|---|---|
| Tokens | `packages/ui/src/index.css` (@theme + :root) |
| Utility classes | `packages/ui/src/index.css` (rest of file) |
| Dialog template | `packages/ui/src/components/start/SettingsDialog.tsx` |
| Card template | `packages/ui/src/components/panels/ApprovalInbox.tsx` |
| Button variants | `packages/ui/src/components/panels/ApprovalInbox.tsx` (coloured) / `index.css` (.cockpit-btn, .office-overlay-btn) |
| Provider accent | `packages/ui/src/components/providerAccent.ts` |
| Risk badges | `packages/ui/src/components/RiskBadge.tsx` |
| Loading | `packages/ui/src/components/LoadingSpinner.tsx` |
| Character picker | `packages/ui/src/components/sessions/CharacterPicker.tsx` |
| Sprite sheets | `packages/ui/public/sprites/` |
| Start-page scene | `packages/ui/src/components/start/CockpitScene.tsx` |

When in doubt: grep the class name, find two uses, copy the one that looks closer to what you're building.
